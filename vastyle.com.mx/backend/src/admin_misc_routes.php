<?php
declare(strict_types=1);

function admin_orders(): never
{
    require_method(['GET', 'PATCH']);
    require_admin();
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $rows = db()->query('SELECT * FROM orders WHERE archived = 0 ORDER BY created_at DESC')->fetchAll();
        json_response(['ok' => true, 'data' => $rows]);
    }
    require_csrf();
    $body = request_json();
    $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
    $status = strtolower(trim((string) ($body['status'] ?? '')));
    if (!$id || $id < 1 || $status === '' || strlen($status) > 40 || !preg_match('/^[a-z_]+$/', $status)) {
        json_response(['ok' => false, 'error' => 'Estado o pedido no válido.'], 422);
    }
    $statement = db()->prepare(
        'UPDATE orders SET status = :status, order_status = :order_status, archived = :archived WHERE id = :id'
    );
    $statement->execute([
        ':status' => $status,
        ':order_status' => $status,
        ':archived' => $status === 'entregado' ? 1 : 0,
        ':id' => $id,
    ]);
    if ($statement->rowCount() < 1) {
        $check = db()->prepare('SELECT id FROM orders WHERE id = :id');
        $check->execute([':id' => $id]);
        if (!$check->fetchColumn()) json_response(['ok' => false, 'error' => 'Pedido no encontrado.'], 404);
    }
    json_response(['ok' => true, 'id' => $id]);
}

function admin_whatsapp_lines(): never
{
    require_method(['GET', 'PATCH']);
    require_admin();
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $lines = db()->query(
            'SELECT id, phone_number, display_name, is_active, display_order
             FROM whatsapp_advisor_lines ORDER BY display_order ASC, id ASC'
        )->fetchAll();
        foreach ($lines as &$line) {
            $line['id'] = (int) $line['id'];
            $line['is_active'] = (bool) $line['is_active'];
            $line['display_order'] = (int) $line['display_order'];
        }
        unset($line);
        json_response(['ok' => true, 'lines' => $lines]);
    }

    require_csrf();
    $body = request_json();
    $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
    $phone = preg_replace('/\D+/', '', (string) ($body['phone_number'] ?? '')) ?? '';
    $name = trim((string) ($body['display_name'] ?? ''));
    if (!$id || $id < 1 || !array_key_exists('is_active', $body) || !preg_match('/^[0-9]{10,15}$/', $phone)
        || $name === '' || mb_strlen($name, 'UTF-8') > 80) {
        json_response(['ok' => false, 'error' => 'La línea de WhatsApp no es válida.'], 422);
    }
    $duplicate = db()->prepare('SELECT id FROM whatsapp_advisor_lines WHERE phone_number = :phone AND id <> :id');
    $duplicate->execute([':phone' => $phone, ':id' => $id]);
    if ($duplicate->fetchColumn()) {
        json_response(['ok' => false, 'error' => 'Ese número ya está asignado a otra línea.'], 409);
    }
    $isActive = filter_var($body['is_active'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    $statement = db()->prepare(
        'UPDATE whatsapp_advisor_lines SET phone_number = :phone, display_name = :name, is_active = :is_active WHERE id = :id'
    );
    $statement->execute([':phone' => $phone, ':name' => $name, ':is_active' => $isActive, ':id' => $id]);
    $fetch = db()->prepare(
        'SELECT id, phone_number, display_name, is_active, display_order FROM whatsapp_advisor_lines WHERE id = :id'
    );
    $fetch->execute([':id' => $id]);
    $line = $fetch->fetch();
    if (!$line) json_response(['ok' => false, 'error' => 'La línea no existe.'], 404);
    $line['id'] = (int) $line['id'];
    $line['is_active'] = (bool) $line['is_active'];
    $line['display_order'] = (int) $line['display_order'];
    json_response(['ok' => true, 'line' => $line]);
}

function admin_reviews(): never
{
    require_method(['GET', 'PATCH', 'DELETE']);
    require_admin();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        $rows = db()->query('SELECT * FROM reviews ORDER BY created_at DESC')->fetchAll();
        json_response(['ok' => true, 'data' => array_map('review_row', $rows)]);
    }
    require_csrf();
    $body = request_json();
    $id = filter_var($body['reviewId'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) json_response(['ok' => false, 'error' => 'Reseña no válida.'], 422);
    if ($method === 'DELETE') {
        $statement = db()->prepare('DELETE FROM reviews WHERE id = :id');
        $statement->execute([':id' => $id]);
        if ($statement->rowCount() !== 1) json_response(['ok' => false, 'error' => 'Reseña no encontrada.'], 404);
        json_response(['ok' => true, 'deletedReviewId' => $id]);
    }
    $approved = filter_var($body['approved'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    $statement = db()->prepare('UPDATE reviews SET approved = :approved WHERE id = :id');
    $statement->execute([':approved' => $approved, ':id' => $id]);
    $statement = db()->prepare('SELECT * FROM reviews WHERE id = :id');
    $statement->execute([':id' => $id]);
    $review = $statement->fetch();
    if (!$review) json_response(['ok' => false, 'error' => 'Reseña no encontrada.'], 404);
    json_response(['ok' => true, 'review' => review_row($review)]);
}

function admin_home_settings(): never
{
    require_method('POST');
    require_admin();
    require_csrf();
    $body = request_json();
    $fields = [
        'hero_image_url', 'new_arrivals_image_url', 'best_sellers_image_url',
        'hero_title', 'hero_subtitle', 'new_arrivals_title', 'new_arrivals_subtitle',
        'best_sellers_title', 'best_sellers_subtitle', 'show_install_banner',
        'install_banner_title', 'install_banner_subtitle',
    ];
    $values = [];
    foreach ($fields as $field) {
        $value = $field === 'show_install_banner'
            ? (filter_var($body[$field] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
            : trim((string) ($body[$field] ?? ''));
        if (str_ends_with($field, '_url') && $value !== '' && !is_local_media_url($value)) {
            json_response(['ok' => false, 'error' => 'Los medios del inicio deben estar alojados en V&A Style.'], 422);
        }
        if (is_string($value) && mb_strlen($value) > (str_ends_with($field, '_url') ? 1200 : 500)) {
            json_response(['ok' => false, 'error' => 'Los datos del inicio son demasiado largos.'], 422);
        }
        $values[':' . $field] = $value;
    }
    $columns = implode(', ', $fields);
    $parameters = implode(', ', array_keys($values));
    $updates = implode(', ', array_map(static fn (string $field): string => "{$field} = VALUES({$field})", $fields));
    $statement = db()->prepare(
        "INSERT INTO home_settings (id, {$columns}) VALUES (1, {$parameters})
         ON DUPLICATE KEY UPDATE {$updates}"
    );
    $statement->execute($values);
    json_response(['ok' => true]);
}

function admin_showroom(): never
{
    require_method(['POST', 'DELETE']);
    require_admin();
    require_csrf();
    $body = request_json();
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'DELETE') {
        $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id || $id < 1) json_response(['ok' => false, 'error' => 'Showroom no válido.'], 422);
        $statement = db()->prepare('DELETE FROM showroom_arrivals WHERE id = :id');
        $statement->execute([':id' => $id]);
        if ($statement->rowCount() !== 1) json_response(['ok' => false, 'error' => 'Imagen no encontrada.'], 404);
        json_response(['ok' => true, 'id' => $id]);
    }
    $url = trim((string) ($body['image_url'] ?? ''));
    if ($url === '' || mb_strlen($url) > 1200 || !is_local_media_url($url, '/media/showroom/')) {
        json_response(['ok' => false, 'error' => 'Imagen de showroom no válida.'], 422);
    }
    $statement = db()->prepare(
        'INSERT INTO showroom_arrivals (title, codes, description, image_url)
         VALUES ("SHOWROOM", "", "", :image_url)'
    );
    $statement->execute([':image_url' => $url]);
    json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
}

function admin_showroom_media(): never
{
    require_method('POST');
    require_admin();
    require_csrf();
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
        !is_uploaded_file((string) ($file['tmp_name'] ?? '')) ||
        (int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > 10 * 1024 * 1024) {
        json_response(['ok' => false, 'error' => 'Imagen de showroom no válida.'], 422);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) json_response(['ok' => false, 'error' => 'Formato de imagen no permitido.'], 415);
    $root = (string) (config()['storage']['public_root'] ?? dirname(__DIR__, 2) . '/media');
    $directory = rtrim($root, '/') . '/showroom';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('No fue posible preparar el almacenamiento de showroom.');
    }
    $name = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $directory . '/' . $name)) {
        throw new RuntimeException('No fue posible guardar la imagen de showroom.');
    }
    $base = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
    json_response(['ok' => true, 'url' => $base . '/showroom/' . $name], 201);
}
