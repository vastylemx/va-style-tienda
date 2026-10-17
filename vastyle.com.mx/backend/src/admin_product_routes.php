<?php
declare(strict_types=1);

function admin_product_id(mixed $value): int
{
    $id = filter_var($value, FILTER_VALIDATE_INT);
    if ($id === false || $id < 1) {
        json_response(['ok' => false, 'error' => 'El producto indicado no es válido.'], 422);
    }
    return $id;
}

function admin_new_arrival_start(bool $enabled, ?array $current): ?string
{
    if (!$enabled) {
        return null;
    }
    $startedAt = (string) ($current['new_arrival_started_at'] ?? '');
    $startedTime = $startedAt !== '' ? strtotime($startedAt . ' UTC') : false;
    if (!empty($current['is_new_arrival']) && $startedTime !== false &&
        $startedTime > time() - 20 * 86400) {
        return $startedAt;
    }
    return gmdate('Y-m-d H:i:s');
}

function admin_product_model_code(string $name): string
{
    $name = mb_strtoupper(trim($name));
    $first = preg_split('/\s+/u', $name)[0] ?? '';
    return preg_match('/^[A-Z]*\d+[A-Z0-9-]*$/D', $first) ? $first : $name;
}

function admin_product_group_update(array $body, array $values): never
{
    $rawIds = $body['productIds'] ?? null;
    if (!is_array($rawIds) || count($rawIds) < 1 || count($rawIds) > 500) {
        json_response(['ok' => false, 'error' => 'Selecciona un modelo válido.'], 422);
    }
    $ids = array_map('admin_product_id', $rawIds);
    if (count(array_unique($ids)) !== count($ids)) {
        json_response(['ok' => false, 'error' => 'Hay variantes repetidas en el modelo.'], 422);
    }
    $sourceCode = mb_strtoupper(trim((string) ($body['sourceModelCode'] ?? '')));
    if ($sourceCode === '') {
        json_response(['ok' => false, 'error' => 'Falta el código original del modelo.'], 422);
    }
    if (count($ids) > 1 && preg_match('/^[A-Z]*\d+[A-Z0-9-]*$/D', $sourceCode) &&
        !preg_match('/^[A-Z]*\d+[A-Z0-9-]*$/D', $values[':name'])) {
        json_response(['ok' => false, 'error' => 'Usa un código base sin espacios para conservar juntas las variantes.'], 422);
    }

    $database = db();
    $database->beginTransaction();
    try {
        $idParams = [];
        foreach ($ids as $index => $id) {
            $idParams[":id{$index}"] = $id;
        }
        $locked = $database->prepare(
            'SELECT id, name, brand, category, wholesale_price, is_outlet,
                    is_new_arrival, new_arrival_started_at
             FROM products WHERE id IN (' . implode(', ', array_keys($idParams)) . ') FOR UPDATE'
        );
        $locked->execute($idParams);
        $rows = $locked->fetchAll();
        if (count($rows) !== count($ids)) {
            $database->rollBack();
            json_response(['ok' => false, 'error' => 'El modelo cambió. Actualiza la lista e inténtalo de nuevo.'], 409);
        }

        $first = $rows[0];
        foreach ($rows as $row) {
            if (admin_product_model_code($row['name']) !== $sourceCode ||
                $row['brand'] !== $first['brand'] || $row['category'] !== $first['category'] ||
                (float) $row['wholesale_price'] !== (float) $first['wholesale_price']) {
                $database->rollBack();
                json_response(['ok' => false, 'error' => 'Las variantes ya no pertenecen al mismo bloque. Actualiza la lista.'], 409);
            }
        }

        $statement = $database->prepare(
            'UPDATE products SET name = :name, brand = :brand, category = :category,
             original_category = :original_category, is_outlet = :is_outlet,
             outlet_price = :outlet_price, last_pieces = :last_pieces, sizes = :sizes,
             discount_percent = :discount_percent, is_new_arrival = :is_new_arrival,
             new_arrival_started_at = :new_arrival_started_at,
             is_best_seller = :is_best_seller, is_home_featured = :is_home_featured,
             wholesale_price = :wholesale_price, shipping_factor = :shipping_factor
             WHERE id = :id'
        );
        unset($values[':image_url']);
        foreach ($rows as $row) {
            $oldName = trim($row['name']);
            $suffix = trim(mb_substr($oldName, mb_strlen($sourceCode)));
            $newName = trim($values[':name'] . ($suffix !== '' ? ' ' . $suffix : ''));
            if (mb_strlen($newName) > 200) {
                $database->rollBack();
                json_response(['ok' => false, 'error' => 'El nombre del modelo es demasiado largo para una variante.'], 422);
            }
            $rowValues = $values;
            $rowValues[':name'] = $newName;
            $rowValues[':original_category'] = ($values[':is_outlet'] || $row['is_outlet'])
                ? $body['category'] : null;
            $rowValues[':new_arrival_started_at'] = admin_new_arrival_start(
                (bool) $values[':is_new_arrival'], $row
            );
            $statement->execute($rowValues + [':id' => $row['id']]);
        }
        $database->commit();
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->rollBack();
        }
        throw $error;
    }
    json_response(['ok' => true, 'updatedIds' => $ids, 'updatedCount' => count($ids)]);
}

function admin_product(): never
{
    require_method(['POST', 'PATCH']);
    require_admin();
    require_csrf();
    $body = request_json();
    $method = strtoupper((string) $_SERVER['REQUEST_METHOD']);

    if ($method === 'PATCH') {
        $id = admin_product_id($body['id'] ?? null);
        $field = (string) ($body['field'] ?? '');
        if (!in_array($field, ['is_new_arrival', 'is_best_seller', 'is_home_featured'], true)) {
            json_response(['ok' => false, 'error' => 'La opción del producto no es válida.'], 422);
        }
        $exists = db()->prepare('SELECT id, is_new_arrival, new_arrival_started_at FROM products WHERE id = :id');
        $exists->execute([':id' => $id]);
        $current = $exists->fetch();
        if (!$current) {
            json_response(['ok' => false, 'error' => 'El producto no existe.'], 404);
        }
        $enabled = filter_var($body['value'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        if ($field === 'is_new_arrival') {
            $startedAt = admin_new_arrival_start($enabled === 1, $current);
            $statement = db()->prepare(
                'UPDATE products SET is_new_arrival = :value, new_arrival_started_at = :started_at WHERE id = :id'
            );
            $statement->execute([':value' => $enabled, ':started_at' => $startedAt, ':id' => $id]);
        } else {
            $statement = db()->prepare("UPDATE products SET {$field} = :value WHERE id = :id");
            $statement->execute([':value' => $enabled, ':id' => $id]);
        }
        json_response(['ok' => true, 'id' => $id]);
    }

    $isGroupUpdate = array_key_exists('productIds', $body);
    $id = !$isGroupUpdate && isset($body['id']) ? admin_product_id($body['id']) : null;
    $name = trim((string) ($body['name'] ?? ''));
    $brand = trim((string) ($body['brand'] ?? ''));
    $category = trim((string) ($body['category'] ?? ''));
    $sizes = trim((string) ($body['sizes'] ?? ''));
    $imageUrl = trim((string) ($body['image_url'] ?? ''));
    $price = filter_var($body['wholesale_price'] ?? null, FILTER_VALIDATE_FLOAT);
    $discount = filter_var($body['discount_percent'] ?? 0, FILTER_VALIDATE_FLOAT);
    $shippingFactor = filter_var($body['shipping_factor'] ?? 1, FILTER_VALIDATE_FLOAT);
    $isOutlet = filter_var($body['is_outlet'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $outletPrice = filter_var($body['outlet_price'] ?? null, FILTER_VALIDATE_FLOAT);

    $current = null;
    if ($id !== null) {
        $exists = db()->prepare('SELECT id, is_new_arrival, new_arrival_started_at, is_outlet FROM products WHERE id = :id');
        $exists->execute([':id' => $id]);
        $current = $exists->fetch();
        if (!$current) {
            json_response(['ok' => false, 'error' => 'El producto no existe.'], 404);
        }
    }

    if ($name === '' || mb_strlen($name) > 200 || mb_strlen($brand) > 160 ||
        $category === '' || mb_strlen($category) > 120 || mb_strlen($sizes) > 255 ||
        (!$isGroupUpdate && ($imageUrl === '' || mb_strlen($imageUrl) > 1200 ||
        !is_local_media_url($imageUrl, '/media/products/'))) ||
        $price === false || $price <= 0 || $discount === false || $discount < 0 || $discount > 100 ||
        $shippingFactor === false || $shippingFactor <= 0 || $category === 'OUTLET' ||
        ($isOutlet && ($outletPrice === false || $outletPrice <= 0))) {
        json_response(['ok' => false, 'error' => 'Revisa los datos y la imagen del producto.'], 422);
    }

    $isNewArrival = filter_var($body['is_new_arrival'] ?? false, FILTER_VALIDATE_BOOLEAN);

    $values = [
        ':name' => $name,
        ':brand' => $brand,
        ':category' => $isOutlet ? 'OUTLET' : $category,
        ':original_category' => ($isOutlet || !empty($current['is_outlet'])) ? $category : null,
        ':is_outlet' => $isOutlet ? 1 : 0,
        ':outlet_price' => $isOutlet ? $outletPrice : null,
        ':last_pieces' => $isOutlet && filter_var($body['last_pieces'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
        ':sizes' => $sizes,
        ':discount_percent' => $discount,
        ':is_new_arrival' => $isNewArrival ? 1 : 0,
        ':new_arrival_started_at' => admin_new_arrival_start($isNewArrival, $current),
        ':is_best_seller' => filter_var($body['is_best_seller'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
        ':is_home_featured' => filter_var($body['is_home_featured'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
        ':wholesale_price' => $price,
        ':shipping_factor' => $shippingFactor,
        ':image_url' => $imageUrl,
    ];
    if ($isGroupUpdate) {
        admin_product_group_update($body, $values);
    }
    $columns = 'name, brand, category, original_category, is_outlet, outlet_price, last_pieces, sizes, discount_percent, is_new_arrival, new_arrival_started_at, is_best_seller, is_home_featured, wholesale_price, shipping_factor, image_url';
    $placeholders = ':name, :brand, :category, :original_category, :is_outlet, :outlet_price, :last_pieces, :sizes, :discount_percent, :is_new_arrival, :new_arrival_started_at, :is_best_seller, :is_home_featured, :wholesale_price, :shipping_factor, :image_url';

    if ($id === null) {
        $statement = db()->prepare("INSERT INTO products ({$columns}) VALUES ({$placeholders})");
        $statement->execute($values);
        json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
    }

    $assignments = implode(', ', array_map(
        static fn (string $column): string => "{$column} = :{$column}",
        explode(', ', $columns)
    ));
    $statement = db()->prepare("UPDATE products SET {$assignments} WHERE id = :id");
    $statement->execute($values + [':id' => $id]);
    json_response(['ok' => true, 'id' => $id]);
}

function admin_product_delete(): never
{
    require_method('DELETE');
    require_admin();
    require_csrf();
    $body = request_json();
    $id = admin_product_id($body['productId'] ?? null);
    $statement = db()->prepare('DELETE FROM products WHERE id = :id');
    $statement->execute([':id' => $id]);
    if ($statement->rowCount() !== 1) {
        json_response(['ok' => false, 'error' => 'El producto no existe o ya fue eliminado.'], 404);
    }
    json_response(['ok' => true, 'confirmedDeleted' => true, 'deletedProductId' => $id]);
}

function admin_product_image(): never
{
    require_method('POST');
    require_admin();
    require_csrf();
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
        !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        json_response(['ok' => false, 'error' => 'No se recibió una imagen válida.'], 422);
    }
    if ((int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > 10 * 1024 * 1024) {
        json_response(['ok' => false, 'error' => 'La imagen debe pesar 10 MB o menos.'], 413);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        json_response(['ok' => false, 'error' => 'Formato de imagen no permitido.'], 415);
    }
    $mediaRoot = (string) (config()['storage']['public_root'] ?? dirname(__DIR__, 2) . '/media');
    $directory = rtrim($mediaRoot, '/') . '/products';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('No fue posible preparar el almacenamiento de productos.');
    }
    $fileName = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $directory . '/' . $fileName)) {
        throw new RuntimeException('No fue posible guardar la imagen del producto.');
    }
    $baseUrl = rtrim((string) (config()['storage']['public_url'] ?? '/media'), '/');
    json_response(['ok' => true, 'url' => $baseUrl . '/products/' . $fileName], 201);
}
