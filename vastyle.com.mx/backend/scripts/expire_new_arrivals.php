<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$bootstrap = dirname(__DIR__) . '/src/bootstrap.php';
if (!is_file($bootstrap)) {
    $bootstrap = __DIR__ . '/bootstrap.php';
}
require_once $bootstrap;

$statement = db()->prepare(
    'UPDATE products
     SET is_new_arrival = 0, new_arrival_started_at = NULL
     WHERE is_new_arrival = 1
       AND (new_arrival_started_at IS NULL
            OR new_arrival_started_at <= UTC_TIMESTAMP(6) - INTERVAL 20 DAY)'
);
$statement->execute();
fwrite(STDOUT, "Expired new arrivals: {$statement->rowCount()}\n");
