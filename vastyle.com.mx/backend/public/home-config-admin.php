<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/admin_home_routes.php';

try {
    admin_home_config();
} catch (Throwable $error) {
    handle_unexpected_error($error);
}
