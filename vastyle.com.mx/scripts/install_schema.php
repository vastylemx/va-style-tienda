<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

function finish(array $body, int $status): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        finish(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }

    $configPath = '/home/vastyle/app_config/production.php';
    $schemaPath = '/home/vastyle/migration_candidate/database/001_schema_draft.sql';
    if (!is_readable($configPath) || !is_readable($schemaPath)) {
        finish(['ok' => false, 'error' => 'Faltan archivos privados de migración.'], 500);
    }

    $config = require $configPath;
    $expectedToken = (string) ($config['security']['installer_token'] ?? '');
    $providedToken = (string) ($_SERVER['HTTP_X_MIGRATION_TOKEN'] ?? '');
    if ($expectedToken === '' || $providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
        finish(['ok' => false, 'error' => 'No autorizado.'], 403);
    }

    $database = $config['database'] ?? [];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $database['host'] ?? 'localhost',
        (int) ($database['port'] ?? 3306),
        $database['name'] ?? '',
        $database['charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $database['user'] ?? '', $database['password'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");

    $schema = file_get_contents($schemaPath);
    if ($schema === false || trim($schema) === '') {
        finish(['ok' => false, 'error' => 'El esquema está vacío.'], 500);
    }

    $statements = preg_split('/;\s*(?:\r?\n|$)/', $schema) ?: [];
    $executed = 0;
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if ($statement === '' || preg_match('/^--[^\n]*$/', $statement)) {
            continue;
        }
        $pdo->exec($statement);
        $executed++;
    }

    $tableCount = (int) $pdo->query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"
    )->fetchColumn();

    finish(['ok' => true, 'statements' => $executed, 'tables' => $tableCount], 200);
} catch (Throwable $error) {
    error_log('[vastyle-migration] ' . $error->getMessage());
    finish(['ok' => false, 'error' => 'La instalación del esquema falló.'], 500);
}
