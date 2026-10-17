<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/admin_home_routes.php';

try {
    upload_admin_home_banner_media();
} catch (Throwable $error) {
    handle_unexpected_error($error);
}
