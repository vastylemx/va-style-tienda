<?php
declare(strict_types=1);

function admin_home_require_method(string|array $allowed): void
{
    $methods = is_array($allowed) ? $allowed : [$allowed];
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        json_response(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
}

function admin_home_clean_string(mixed $value, int $maxLength = 500): string
{
    $clean = trim((string) $value);
    if (mb_strlen($clean, 'UTF-8') > $maxLength) {
        $clean = mb_substr($clean, 0, $maxLength, 'UTF-8');
    }
    return $clean;
}

function admin_home_bool_value(mixed $value): int
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
}

function ensure_home_banner_video_column(): void
{
    $check = db()->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    $check->execute([':table_name' => 'home_banners', ':column_name' => 'video_url']);
    if ((int) $check->fetchColumn() === 0) {
        db()->exec('ALTER TABLE home_banners ADD COLUMN video_url VARCHAR(1200) NULL AFTER mobile_image_url');
    }
}

function admin_home_media_url(mixed $value): string
{
    $url = admin_home_clean_string($value, 1200);
    if ($url === '') {
        return '';
    }
    if (is_local_media_url($url)) {
        return $url;
    }
    json_response(['ok' => false, 'error' => 'La dirección del medio debe ser HTTPS o pertenecer al almacenamiento público.'], 422);
}

function admin_home_datetime(mixed $value): ?string
{
    $date = admin_home_clean_string($value, 32);
    if ($date === '') {
        return null;
    }
    $date = str_replace('T', ' ', $date);
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d H:i', $date, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$parsed || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        json_response(['ok' => false, 'error' => 'La fecha del banner no es válida.'], 422);
    }
    return $parsed->format('Y-m-d H:i:s');
}

function admin_home_config(): never
{
    admin_home_require_method(['GET', 'POST', 'DELETE']);
    require_admin();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        $sections = db()->query('SELECT * FROM home_sections ORDER BY display_order ASC, id ASC')->fetchAll();
        $banners = db()->query('SELECT * FROM home_banners ORDER BY display_order ASC, id ASC')->fetchAll();
        $categories = db()->query('SELECT * FROM featured_categories ORDER BY display_order ASC, id ASC')->fetchAll();
        $productCategories = db()->query("SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category ASC")->fetchAll(PDO::FETCH_COLUMN);
        json_response([
            'ok' => true,
            'sections' => $sections,
            'banners' => $banners,
            'featuredCategories' => $categories,
            'productCategories' => $productCategories,
        ]);
    }

    require_csrf();
    $body = request_json();
    $entity = admin_home_clean_string($body['entity'] ?? '', 40);

    if ($method === 'DELETE') {
        $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id || $id < 1) {
            json_response(['ok' => false, 'error' => 'El elemento indicado no es válido.'], 422);
        }
        $table = match ($entity) {
            'banner' => 'home_banners',
            'category' => 'featured_categories',
            default => '',
        };
        if ($table === '') json_response(['ok' => false, 'error' => 'No se puede eliminar este elemento.'], 422);
        $delete = db()->prepare("DELETE FROM {$table} WHERE id = :id");
        $delete->execute([':id' => $id]);
        if ($delete->rowCount() !== 1) {
            json_response(['ok' => false, 'error' => 'El elemento no existe o ya fue eliminado.'], 404);
        }
        json_response(['ok' => true]);
    }

    if ($entity === 'section') {
        $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
        $title = admin_home_clean_string($body['title'] ?? '', 200);
        $subtitle = admin_home_clean_string($body['subtitle'] ?? '', 500);
        $visibility = admin_home_clean_string($body['visibility_mode'] ?? '', 12);
        $displayOrder = max(-100000, min(100000, (int) ($body['display_order'] ?? 0)));
        $itemLimit = (int) ($body['item_limit'] ?? 8);
        if (!$id || $id < 1 || $title === '' || !in_array($visibility, ['active', 'inactive', 'automatic'], true) ||
            $itemLimit < 1 || $itemLimit > 50) {
            json_response(['ok' => false, 'error' => 'Revisa los datos de la sección.'], 422);
        }
        $statement = db()->prepare(
            'UPDATE home_sections SET title = :title, subtitle = :subtitle, is_active = :is_active,
                visibility_mode = :visibility_mode, display_order = :display_order, item_limit = :item_limit,
                show_view_all = :show_view_all, start_at = :start_at, end_at = :end_at WHERE id = :id'
        );
        $statement->execute([
            ':title' => $title,
            ':subtitle' => $subtitle ?: null,
            ':is_active' => admin_home_bool_value($body['is_active'] ?? false),
            ':visibility_mode' => $visibility,
            ':display_order' => $displayOrder,
            ':item_limit' => $itemLimit,
            ':show_view_all' => admin_home_bool_value($body['show_view_all'] ?? false),
            ':start_at' => admin_home_datetime($body['start_at'] ?? ''),
            ':end_at' => admin_home_datetime($body['end_at'] ?? ''),
            ':id' => $id,
        ]);
        $fetch = db()->prepare('SELECT * FROM home_sections WHERE id = :id');
        $fetch->execute([':id' => $id]);
        $item = $fetch->fetch();
        if (!$item) json_response(['ok' => false, 'error' => 'La sección no existe.'], 404);
        $item['is_active'] = (bool) $item['is_active'];
        $item['show_view_all'] = (bool) $item['show_view_all'];
        json_response(['ok' => true, 'item' => $item]);
    }

    if ($entity === 'category') {
        $id = isset($body['id']) ? filter_var($body['id'], FILTER_VALIDATE_INT) : null;
        $name = admin_home_clean_string($body['category_name'] ?? '', 120);
        $imageUrl = admin_home_clean_string($body['image_url'] ?? '', 1200);
        $altText = admin_home_clean_string($body['alt_text'] ?? '', 255);
        $displayOrder = max(-100000, min(100000, (int) ($body['display_order'] ?? 0)));
        if ($id === false || ($id !== null && (!$id || $id < 1)) || $name === '' ||
            $imageUrl === '' || !is_local_media_url($imageUrl)) {
            json_response(['ok' => false, 'error' => 'Revisa la categoría y su imagen.'], 422);
        }
        $values = [
            ':category_name' => $name,
            ':image_url' => $imageUrl,
            ':alt_text' => $altText,
            ':display_order' => $displayOrder,
            ':is_active' => admin_home_bool_value($body['is_active'] ?? false),
            ':start_at' => admin_home_datetime($body['start_at'] ?? ''),
            ':end_at' => admin_home_datetime($body['end_at'] ?? ''),
        ];
        if ($id !== null) {
            $values[':id'] = $id;
            $save = db()->prepare(
                'UPDATE featured_categories SET category_name = :category_name, image_url = :image_url,
                    alt_text = :alt_text, display_order = :display_order, is_active = :is_active,
                    start_at = :start_at, end_at = :end_at WHERE id = :id'
            );
            $save->execute($values);
            $savedId = $id;
        } else {
            $save = db()->prepare(
                'INSERT INTO featured_categories
                    (category_name, image_url, alt_text, display_order, is_active, start_at, end_at)
                 VALUES (:category_name, :image_url, :alt_text, :display_order, :is_active, :start_at, :end_at)'
            );
            $save->execute($values);
            $savedId = (int) db()->lastInsertId();
        }
        $fetch = db()->prepare('SELECT * FROM featured_categories WHERE id = :id');
        $fetch->execute([':id' => $savedId]);
        $item = $fetch->fetch();
        if (!$item) throw new RuntimeException('No fue posible confirmar la categoría guardada.');
        $item['is_active'] = (bool) $item['is_active'];
        $item['display_order'] = (int) $item['display_order'];
        json_response(['ok' => true, 'item' => $item]);
    }

    if ($entity !== 'banner') {
        json_response(['ok' => false, 'error' => 'El tipo de contenido no es válido.'], 422);
    }

    ensure_home_banner_video_column();
    $id = isset($body['id']) ? filter_var($body['id'], FILTER_VALIDATE_INT) : null;
    if ($id !== null && (!$id || $id < 1)) {
        json_response(['ok' => false, 'error' => 'El banner indicado no es válido.'], 422);
    }

    $videoUrl = admin_home_media_url($body['video_url'] ?? '');
    $imageUrl = admin_home_media_url($body['image_url'] ?? '');
    $mobileImageUrl = admin_home_media_url($body['mobile_image_url'] ?? '');
    if ($imageUrl === '') {
        json_response(['ok' => false, 'error' => 'Agrega una imagen principal como respaldo del video.'], 422);
    }

    $position = admin_home_clean_string($body['text_position'] ?? 'left', 10);
    if (!in_array($position, ['left', 'center', 'right'], true)) {
        $position = 'left';
    }
    $displayOrder = max(-100000, min(100000, (int) ($body['display_order'] ?? 0)));
    $values = [
        ':title' => admin_home_clean_string($body['title'] ?? '', 200),
        ':subtitle' => admin_home_clean_string($body['subtitle'] ?? '', 500) ?: null,
        ':eyebrow' => admin_home_clean_string($body['eyebrow'] ?? '', 120) ?: null,
        ':image_url' => $imageUrl,
        ':mobile_image_url' => $mobileImageUrl ?: null,
        ':video_url' => $videoUrl ?: null,
        ':alt_text' => admin_home_clean_string($body['alt_text'] ?? '', 255),
        ':button_text' => admin_home_clean_string($body['button_text'] ?? '', 120) ?: null,
        ':destination_type' => admin_home_clean_string($body['destination_type'] ?? '', 40) ?: null,
        ':destination_value' => admin_home_clean_string($body['destination_value'] ?? '', 500) ?: null,
        ':text_position' => $position,
        ':is_active' => admin_home_bool_value($body['is_active'] ?? false),
        ':display_order' => $displayOrder,
        ':start_at' => admin_home_datetime($body['start_at'] ?? ''),
        ':end_at' => admin_home_datetime($body['end_at'] ?? ''),
    ];
    if ($values[':title'] === '') {
        json_response(['ok' => false, 'error' => 'El título del banner es obligatorio.'], 422);
    }

    if ($id !== null) {
        $values[':id'] = $id;
        $save = db()->prepare(
            'UPDATE home_banners SET title = :title, subtitle = :subtitle, eyebrow = :eyebrow,
                image_url = :image_url, mobile_image_url = :mobile_image_url, video_url = :video_url,
                alt_text = :alt_text, button_text = :button_text, destination_type = :destination_type,
                destination_value = :destination_value, text_position = :text_position, is_active = :is_active,
                display_order = :display_order, start_at = :start_at, end_at = :end_at WHERE id = :id'
        );
        $save->execute($values);
        $savedId = $id;
    } else {
        $save = db()->prepare(
            'INSERT INTO home_banners (title, subtitle, eyebrow, image_url, mobile_image_url, video_url,
                alt_text, button_text, destination_type, destination_value, text_position, is_active,
                display_order, start_at, end_at)
             VALUES (:title, :subtitle, :eyebrow, :image_url, :mobile_image_url, :video_url,
                :alt_text, :button_text, :destination_type, :destination_value, :text_position, :is_active,
                :display_order, :start_at, :end_at)'
        );
        $save->execute($values);
        $savedId = (int) db()->lastInsertId();
    }

    $fetch = db()->prepare('SELECT * FROM home_banners WHERE id = :id LIMIT 1');
    $fetch->execute([':id' => $savedId]);
    $item = $fetch->fetch();
    if (!is_array($item)) {
        throw new RuntimeException('No fue posible confirmar el banner guardado.');
    }
    $item['is_active'] = (bool) $item['is_active'];
    $item['display_order'] = (int) $item['display_order'];
    json_response(['ok' => true, 'item' => $item]);
}

function upload_admin_home_banner_media(): never
{
    admin_home_require_method('POST');
    require_admin();
    require_csrf();

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(['ok' => false, 'error' => 'No se recibió un archivo válido. Revisa el límite de carga del servidor.'], 422);
    }
    if ((int) ($file['size'] ?? 0) < 1) {
        json_response(['ok' => false, 'error' => 'El archivo está vacío.'], 422);
    }
    if (!is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        json_response(['ok' => false, 'error' => 'La carga del video no es válida.'], 422);
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
        json_response(['ok' => false, 'error' => 'Formato no permitido. Usa JPG, PNG, WebP, MP4 o WebM.'], 415);
    }
    $isVideo = str_starts_with((string) $mime, 'video/');
    $maxSize = $isVideo ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if ((int) $file['size'] > $maxSize) {
        json_response(['ok' => false, 'error' => $isVideo ? 'El video debe pesar 20 MB o menos.' : 'La imagen debe pesar 10 MB o menos.'], 413);
    }

    $mediaRoot = (string) (config()['storage']['public_root'] ?? dirname(__DIR__, 2) . '/media');
    $targetDirectory = rtrim($mediaRoot, '/') . '/home-banners';
    if (!is_dir($targetDirectory) && !mkdir($targetDirectory, 0755, true) && !is_dir($targetDirectory)) {
        throw new RuntimeException('No fue posible preparar el almacenamiento de banners.');
    }

    $fileName = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $targetDirectory . '/' . $fileName)) {
        throw new RuntimeException('No fue posible guardar el video del banner.');
    }

    $baseUrl = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
    json_response([
        'ok' => true,
        'url' => $baseUrl . '/home-banners/' . $fileName,
        'media_type' => $isVideo ? 'video' : 'image',
    ], 201);
}
