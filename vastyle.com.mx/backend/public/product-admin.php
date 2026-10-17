<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/admin_product_routes.php';

try {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'DELETE') {
        admin_product_delete();
    }
    if ($method === 'POST' && str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data')) {
        admin_product_image();
    }
    admin_product();
} catch (Throwable $error) {
    handle_unexpected_error($error);
}
