<?php
declare(strict_types=1);

const VASTYLE_DEFAULT_CONFIG = '/home/vastyle/app_config/production.php';

function config(): array
{
    static $config;
    if (is_array($config)) {
        return $config;
    }

    $path = getenv('VASTYLE_CONFIG_FILE') ?: VASTYLE_DEFAULT_CONFIG;
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('La configuración privada de la aplicación no está disponible.');
    }

    $loaded = require $path;
    if (!is_array($loaded)) {
        throw new RuntimeException('La configuración privada no es válida.');
    }

    $config = $loaded;
    return $config;
}

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $database = config()['database'] ?? [];
    foreach (['host', 'name', 'user', 'password'] as $required) {
        if (!isset($database[$required]) || $database[$required] === '') {
            throw new RuntimeException('La conexión de base de datos no está configurada.');
        }
    }

    $charset = $database['charset'] ?? 'utf8mb4';
    $port = (int) ($database['port'] ?? 3306);
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $database['host'],
        $port,
        $database['name'],
        $charset
    );

    $pdo = new PDO($dsn, $database['user'], $database['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
    ]);

    return $pdo;
}

function is_local_media_url(string $value, string $requiredPathPrefix = '/media/'): bool
{
    $url = trim($value);
    if (str_starts_with($url, '/media/')) {
        return str_starts_with(parse_url($url, PHP_URL_PATH) ?: '', $requiredPathPrefix);
    }

    $baseHost = parse_url((string) (config()['app']['base_url'] ?? ''), PHP_URL_HOST);
    $parts = parse_url($url);
    return is_array($parts) && strtolower((string) ($parts['scheme'] ?? '')) === 'https' &&
        strtolower((string) ($parts['host'] ?? '')) === strtolower((string) $baseHost) &&
        str_starts_with((string) ($parts['path'] ?? ''), $requiredPathPrefix);
}

function json_response(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function request_json(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($contentType, 'application/json')) {
        json_response(['ok' => false, 'error' => 'Se requiere application/json.'], 415);
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 2 * 1024 * 1024) {
        json_response(['ok' => false, 'error' => 'El cuerpo de la solicitud no es válido.'], 400);
    }

    try {
        $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        json_response(['ok' => false, 'error' => 'JSON inválido.'], 400);
    }

    if (!is_array($decoded)) {
        json_response(['ok' => false, 'error' => 'El cuerpo debe ser un objeto JSON.'], 400);
    }
    return $decoded;
}

function require_method(string|array $allowed): void
{
    $methods = is_array($allowed) ? $allowed : [$allowed];
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        json_response(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
}

function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $app = config()['app'] ?? [];
    session_name((string) ($app['session_name'] ?? 'vastyle_admin'));
    session_set_cookie_params([
        'lifetime' => (int) ($app['session_lifetime_seconds'] ?? 28800),
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();
}

function csrf_token(): string
{
    start_secure_session();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function require_csrf(): void
{
    start_secure_session();
    $provided = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        json_response(['ok' => false, 'error' => 'Token CSRF inválido.'], 403);
    }
}

function require_admin(): array
{
    start_secure_session();
    $admin = $_SESSION['admin'] ?? null;
    if (!is_array($admin) || empty($admin['id'])) {
        json_response(['ok' => false, 'error' => 'Sesión administrativa requerida.'], 401);
    }
    return $admin;
}

function handle_unexpected_error(Throwable $error): never
{
    error_log(sprintf('[vastyle] %s in %s:%d', $error->getMessage(), $error->getFile(), $error->getLine()));
    json_response(['ok' => false, 'error' => 'Error interno del servidor.'], 500);
}
