<?php
declare(strict_types=1);

function admin_community_id(mixed $value): int
{
    $id = filter_var($value, FILTER_VALIDATE_INT);
    if ($id === false || $id < 1) {
        json_response(['ok' => false, 'error' => 'La publicación indicada no es válida.'], 422);
    }
    return $id;
}

function admin_community_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'media_url' => $row['media_url'],
        'media_type' => $row['media_type'],
        'text' => $row['text'],
        'advisor_line' => (int) $row['advisor_line'],
        'active' => (bool) $row['active'],
        'is_pinned' => (bool) $row['is_pinned'],
        'likes_count' => (int) $row['likes_count'],
        'whatsapp_clicks' => (int) $row['whatsapp_clicks'],
        'created_at' => $row['created_at'],
    ];
}

function admin_community_find(int $id): array
{
    $statement = db()->prepare('SELECT * FROM community_posts WHERE id = :id');
    $statement->execute([':id' => $id]);
    $row = $statement->fetch();
    if (!$row) {
        json_response(['ok' => false, 'error' => 'La publicación no existe.'], 404);
    }
    return $row;
}

function admin_community_upload(): never
{
    require_csrf();
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
        !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        json_response(['ok' => false, 'error' => 'No se recibió un archivo válido. Revisa el límite de carga del servidor.'], 422);
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
        json_response(['ok' => false, 'error' => 'Usa una imagen JPG, PNG o WebP, o un video MP4 o WebM.'], 415);
    }
    $mediaType = str_starts_with($mime, 'video/') ? 'video' : 'image';
    $maxSize = $mediaType === 'video' ? 15 * 1024 * 1024 : 10 * 1024 * 1024;
    if ((int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > $maxSize) {
        json_response(['ok' => false, 'error' => $mediaType === 'video'
            ? 'El video comprimido debe pesar 15 MB o menos.'
            : 'La imagen debe pesar 10 MB o menos.'], 413);
    }

    $mediaRoot = (string) (config()['storage']['public_root'] ?? dirname(__DIR__, 2) . '/media');
    $directory = rtrim($mediaRoot, '/') . '/community';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('No fue posible preparar el almacenamiento de Comunidad.');
    }
    $fileName = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $directory . '/' . $fileName)) {
        throw new RuntimeException('No fue posible guardar el medio de Comunidad.');
    }
    $baseUrl = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
    json_response(['ok' => true, 'url' => $baseUrl . '/community/' . $fileName, 'mediaType' => $mediaType], 201);
}

function admin_community(): never
{
    require_method(['GET', 'POST', 'PATCH', 'DELETE']);
    require_admin();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        $posts = db()->query('SELECT * FROM community_posts ORDER BY is_pinned DESC, created_at DESC, id DESC')->fetchAll();
        $lines = db()->query('SELECT id FROM whatsapp_advisor_lines WHERE is_active = 1 ORDER BY display_order ASC')->fetchAll();
        json_response([
            'ok' => true,
            'posts' => array_map('admin_community_row', $posts),
            'advisorLines' => array_map(static fn (array $line): int => (int) $line['id'], $lines),
        ]);
    }

    if ($method === 'POST' && str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data')) {
        admin_community_upload();
    }

    require_csrf();
    $body = request_json();

    if ($method === 'POST') {
        $text = trim((string) ($body['text'] ?? ''));
        $mediaUrl = trim((string) ($body['media_url'] ?? ''));
        $mediaType = (string) ($body['media_type'] ?? '');
        $advisorLine = admin_community_id($body['advisor_line'] ?? null);
        $baseUrl = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
        $fileName = str_starts_with($mediaUrl, $baseUrl . '/community/')
            ? substr($mediaUrl, strlen($baseUrl . '/community/')) : '';
        if ($text === '' || mb_strlen($text) > 200 ||
            !in_array($mediaType, ['image', 'video'], true) ||
            !preg_match('/^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm)$/', $fileName)) {
            json_response(['ok' => false, 'error' => 'Revisa el texto y el archivo de la publicación.'], 422);
        }
        $lineCheck = db()->prepare('SELECT id FROM whatsapp_advisor_lines WHERE id = :id AND is_active = 1');
        $lineCheck->execute([':id' => $advisorLine]);
        if (!$lineCheck->fetchColumn()) {
            json_response(['ok' => false, 'error' => 'Selecciona una línea de asesor activa.'], 422);
        }
        $statement = db()->prepare(
            'INSERT INTO community_posts (media_url, media_type, text, advisor_line, active, is_pinned)
             VALUES (:media_url, :media_type, :text, :advisor_line, 1, 0)'
        );
        $statement->execute([
            ':media_url' => $mediaUrl,
            ':media_type' => $mediaType,
            ':text' => $text,
            ':advisor_line' => $advisorLine,
        ]);
        $created = admin_community_find((int) db()->lastInsertId());
        json_response(['ok' => true, 'post' => admin_community_row($created)], 201);
    }

    $id = admin_community_id($body['id'] ?? null);
    $existing = admin_community_find($id);
    if ($method === 'PATCH') {
        $field = (string) ($body['field'] ?? '');
        $value = filter_var($body['value'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        if ($field === 'active') {
            $statement = db()->prepare($value
                ? 'UPDATE community_posts SET active = 1 WHERE id = :id'
                : 'UPDATE community_posts SET active = 0, is_pinned = 0 WHERE id = :id');
        } elseif ($field === 'is_pinned') {
            if ($value && !(bool) $existing['active']) {
                json_response(['ok' => false, 'error' => 'Activa la publicación antes de fijarla.'], 422);
            }
            $statement = db()->prepare('UPDATE community_posts SET is_pinned = :value WHERE id = :id');
            $statement->bindValue(':value', $value, PDO::PARAM_INT);
        } else {
            json_response(['ok' => false, 'error' => 'La opción de Comunidad no es válida.'], 422);
        }
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        json_response(['ok' => true, 'post' => admin_community_row(admin_community_find($id))]);
    }

    $statement = db()->prepare('DELETE FROM community_posts WHERE id = :id');
    $statement->execute([':id' => $id]);
    if ($statement->rowCount() !== 1) {
        json_response(['ok' => false, 'error' => 'No se confirmó el borrado de la publicación.'], 409);
    }
    $warning = '';
    $path = parse_url((string) $existing['media_url'], PHP_URL_PATH) ?: '';
    if (preg_match('#^/media/community/([a-f0-9]{32}\.(?:jpg|png|webp|mp4|webm))$#', $path, $matches)) {
        $mediaRoot = (string) (config()['storage']['public_root'] ?? dirname(__DIR__, 2) . '/media');
        $filePath = rtrim($mediaRoot, '/') . '/community/' . $matches[1];
        if (is_file($filePath) && !unlink($filePath)) {
            $warning = 'Publicación eliminada; no fue posible retirar el archivo multimedia.';
        }
    }
    json_response(['ok' => true, 'confirmedDeleted' => true, 'deletedPostId' => $id, 'storageWarning' => $warning]);
}
