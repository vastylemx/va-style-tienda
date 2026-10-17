<?php
declare(strict_types=1);

function public_advisor_lines(): never
{
    require_method('GET');
    $lines = db()->query(
        'SELECT id, display_name FROM whatsapp_advisor_lines
         WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    )->fetchAll();
    foreach ($lines as &$line) {
        $line['id'] = (int) $line['id'];
    }
    unset($line);
    json_response(['ok' => true, 'data' => $lines]);
}

function upload_review_media(): never
{
    require_method('POST');
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(['ok' => false, 'error' => 'No se recibió un archivo válido.'], 422);
    }
    if ((int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > 25 * 1024 * 1024) {
        json_response(['ok' => false, 'error' => 'El archivo supera el tamaño permitido de 25 MB.'], 413);
    }
    if (!is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        json_response(['ok' => false, 'error' => 'La carga del archivo no es válida.'], 422);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
    ];
    if (!isset($extensions[$mime])) {
        json_response(['ok' => false, 'error' => 'Tipo de archivo no permitido.'], 415);
    }

    $mediaRoot = (string) (config()['storage']['public_root'] ?? dirname(__DIR__) . '/media');
    $targetDirectory = rtrim($mediaRoot, '/') . '/reviews';
    if (!is_dir($targetDirectory) && !mkdir($targetDirectory, 0755, true) && !is_dir($targetDirectory)) {
        throw new RuntimeException('No fue posible preparar el almacenamiento de reseñas.');
    }

    $fileName = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $targetDirectory . '/' . $fileName)) {
        throw new RuntimeException('No fue posible guardar el archivo de reseña.');
    }

    $baseUrl = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
    json_response([
        'ok' => true,
        'url' => $baseUrl . '/reviews/' . $fileName,
        'media_type' => str_starts_with((string) $mime, 'video/') ? 'video' : 'image',
    ], 201);
}

function community_likes(): never
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        $deviceId = clean_string($_GET['device_id'] ?? '', 100);
        $postIds = array_values(array_unique(array_filter(
            array_map('intval', explode(',', (string) ($_GET['post_ids'] ?? ''))),
            static fn (int $id): bool => $id > 0
        )));
        if ($deviceId === '' || $postIds === [] || count($postIds) > 100) {
            json_response(['ok' => false, 'error' => 'Dispositivo o publicaciones no válidos.'], 422);
        }

        $placeholders = [];
        $params = [':device_id' => $deviceId];
        foreach ($postIds as $index => $postId) {
            $key = ':post_' . $index;
            $placeholders[] = $key;
            $params[$key] = $postId;
        }
        $stmt = db()->prepare(
            'SELECT post_id FROM community_likes WHERE device_id = :device_id AND post_id IN (' . implode(',', $placeholders) . ')'
        );
        $stmt->execute($params);
        $likes = array_map(static fn (array $row): array => ['post_id' => (int) $row['post_id']], $stmt->fetchAll());
        json_response(['ok' => true, 'data' => $likes]);
    }

    require_method('POST');
    $body = request_json();
    $postId = (int) ($body['post_id'] ?? 0);
    $deviceId = clean_string($body['device_id'] ?? '', 100);
    $liked = bool_value($body['liked'] ?? false) === 1;
    if ($postId < 1 || !preg_match('/^[a-zA-Z0-9._:-]{6,100}$/', $deviceId)) {
        json_response(['ok' => false, 'error' => 'Dispositivo o publicación no válidos.'], 422);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $postStmt = $pdo->prepare('SELECT id FROM community_posts WHERE id = :id AND active = 1 FOR UPDATE');
        $postStmt->execute([':id' => $postId]);
        if (!$postStmt->fetch()) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'La publicación ya no está disponible.'], 404);
        }

        if ($liked) {
            $likeStmt = $pdo->prepare('INSERT IGNORE INTO community_likes (post_id, device_id) VALUES (:post_id, :device_id)');
        } else {
            $likeStmt = $pdo->prepare('DELETE FROM community_likes WHERE post_id = :post_id AND device_id = :device_id');
        }
        $likeStmt->execute([':post_id' => $postId, ':device_id' => $deviceId]);

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM community_likes WHERE post_id = :post_id');
        $countStmt->execute([':post_id' => $postId]);
        $count = (int) $countStmt->fetchColumn();
        $updateStmt = $pdo->prepare('UPDATE community_posts SET likes_count = :likes_count WHERE id = :id');
        $updateStmt->execute([':likes_count' => $count, ':id' => $postId]);
        $pdo->commit();
        json_response(['ok' => true, 'count' => $count]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function select_advisor_for_sequence(array $activeLines, int $sequence): array
{
    if ($activeLines === []) {
        throw new InvalidArgumentException('No hay líneas activas para asignar.');
    }

    return $activeLines[$sequence % count($activeLines)];
}

function advisor_assignment(): never
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'POST') {
        $body = request_json();
        $requestId = clean_string($body['requestId'] ?? '', 36);
        $visitorId = clean_string($body['visitorId'] ?? '', 100);
        $previousAdvisorLine = filter_var($body['advisorLine'] ?? null, FILTER_VALIDATE_INT);
        $preferredAdvisorLine = filter_var($body['preferredAdvisorLine'] ?? null, FILTER_VALIDATE_INT);
        $postId = clean_string($body['postId'] ?? '', 20);
        if (!preg_match('/^[a-f0-9-]{36}$/i', $requestId) || !preg_match('/^[a-zA-Z0-9._:-]{6,100}$/', $visitorId)) {
            json_response(['ok' => false, 'error' => 'La solicitud de asignación no es válida.'], 422);
        }
        if ($postId !== '' && !preg_match('/^[1-9][0-9]{0,19}$/', $postId)) {
            json_response(['ok' => false, 'error' => 'La publicación indicada no es válida.'], 422);
        }
        if (array_key_exists('preferredAdvisorLine', $body) && (!$preferredAdvisorLine || $preferredAdvisorLine < 1)) {
            json_response(['ok' => false, 'error' => 'La línea indicada no es válida.'], 422);
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $existing = $pdo->prepare('SELECT advisor_line, phone_number, created_at FROM whatsapp_assignment_requests WHERE request_id = :request_id');
            $existing->execute([':request_id' => $requestId]);
            $saved = $existing->fetch();
            if ($saved) {
                $pdo->commit();
                json_response([
                    'ok' => true,
                    'advisorLine' => (int) $saved['advisor_line'],
                    'phoneNumber' => $saved['phone_number'],
                    'assignedAt' => $saved['created_at'],
                ]);
            }

            $activeLines = $pdo->query(
                "SELECT id, phone_number FROM whatsapp_advisor_lines
                 WHERE is_active = 1 AND phone_number REGEXP '^[0-9]{10,15}$'
                 ORDER BY display_order ASC"
            )->fetchAll();
            if ($activeLines === []) {
                $pdo->rollBack();
                json_response(['ok' => false, 'error' => 'No hay líneas de WhatsApp activas.'], 503);
            }

            $salt = (string) (config()['security']['whatsapp_rate_limit_salt'] ?? '');
            $clientHash = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $visitorId, $salt);

            $selected = null;
            if ($postId !== '') {
                $postQuery = $pdo->prepare(
                    'SELECT advisor_line FROM community_posts WHERE id = :post_id AND active = 1 LIMIT 1'
                );
                $postQuery->execute([':post_id' => $postId]);
                $post = $postQuery->fetch();
                if (!$post) {
                    $pdo->rollBack();
                    json_response(['ok' => false, 'error' => 'La publicación ya no está disponible.'], 404);
                }

                $assignedLineId = (int) ($post['advisor_line'] ?? 0);
                foreach ($activeLines as $line) {
                    if ((int) $line['id'] === $assignedLineId) {
                        $selected = $line;
                        break;
                    }
                }
            }

            if ($selected === null && $previousAdvisorLine !== false && $previousAdvisorLine !== null) {
                foreach ($activeLines as $line) {
                    if ((int) $line['id'] === $previousAdvisorLine) {
                        $selected = $line;
                        break;
                    }
                }
            }

            if ($selected === null) {
                $previousAssignment = $pdo->prepare(
                    'SELECT advisor_lines.id, advisor_lines.phone_number
                     FROM whatsapp_assignment_requests AS assignment_requests
                     INNER JOIN whatsapp_advisor_lines AS advisor_lines
                       ON advisor_lines.id = assignment_requests.advisor_line
                     WHERE assignment_requests.client_hash = :client_hash AND advisor_lines.is_active = 1
                       AND advisor_lines.phone_number REGEXP \'^[0-9]{10,15}$\'
                     ORDER BY assignment_requests.created_at DESC LIMIT 1 FOR UPDATE'
                );
                $previousAssignment->execute([':client_hash' => $clientHash]);
                $selected = $previousAssignment->fetch() ?: null;
            }

            if ($selected === null && $preferredAdvisorLine !== false && $preferredAdvisorLine !== null) {
                foreach ($activeLines as $line) {
                    if ((int) $line['id'] === $preferredAdvisorLine) {
                        $selected = $line;
                        break;
                    }
                }
                if ($selected === null) {
                    $pdo->rollBack();
                    json_response(['ok' => false, 'error' => 'La línea ya no está disponible.'], 422);
                }
            }

            if ($selected === null) {
                $state = $pdo->query('SELECT next_sequence FROM whatsapp_round_robin_state WHERE id = 1 FOR UPDATE')->fetch();
                $sequence = (int) ($state['next_sequence'] ?? 0);
                $selected = select_advisor_for_sequence($activeLines, $sequence);
                $updateState = $pdo->prepare('UPDATE whatsapp_round_robin_state SET next_sequence = :next_sequence WHERE id = 1');
                $updateState->execute([':next_sequence' => $sequence + 1]);
            }

            $insertRequest = $pdo->prepare(
                'INSERT INTO whatsapp_assignment_requests (request_id, client_hash, advisor_line, phone_number)
                 VALUES (:request_id, :client_hash, :advisor_line, :phone_number)'
            );
            $insertRequest->execute([
                ':request_id' => $requestId,
                ':client_hash' => $clientHash,
                ':advisor_line' => (int) $selected['id'],
                ':phone_number' => $selected['phone_number'],
            ]);
            $pdo->commit();
            json_response([
                'ok' => true,
                'advisorLine' => (int) $selected['id'],
                'phoneNumber' => $selected['phone_number'],
                'assignedAt' => gmdate('c'),
            ]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }

    require_method('GET');
    $stmt = db()->query(
        "SELECT phone_number FROM whatsapp_advisor_lines
         WHERE is_active = 1 AND phone_number REGEXP '^[0-9]{10,15}$'
         ORDER BY display_order ASC LIMIT 1"
    );
    $line = $stmt->fetch();
    if (!$line) {
        json_response(['ok' => false, 'error' => 'No hay líneas de WhatsApp activas.'], 503);
    }
    json_response([
        'ok' => true,
        'phone_number' => $line['phone_number'] ?? '',
        'mode' => 'static',
    ]);
}
