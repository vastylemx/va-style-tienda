<?php
declare(strict_types=1);

if (!in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

$file = dirname(__DIR__) . '/src/ffmpeg-core-CgUfceKH.wasm.br';
if (!is_file($file) || !is_readable($file)) {
    http_response_code(404);
    exit;
}

$etag = '"ffmpeg-core-CgUfceKH"';
header('Content-Type: application/wasm');
header('Content-Encoding: br');
header('Cache-Control: public, max-age=31536000, immutable');
header('Vary: Accept-Encoding');
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

header('Content-Length: ' . filesize($file));
if (strtoupper((string) $_SERVER['REQUEST_METHOD']) === 'GET') {
    readfile($file);
}
