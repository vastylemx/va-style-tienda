<?php
declare(strict_types=1);

// Copiar fuera de public_html como /home/vastyle/app_config/production.php.
// Nunca guardar valores reales en Git ni dentro del frontend.
return [
    'app' => [
        'environment' => 'production',
        'base_url' => 'https://vastyle.com.mx',
        'session_name' => 'vastyle_admin',
        'session_lifetime_seconds' => 28800,
    ],
    'database' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'vastyle_app',
        'user' => 'vastyle_app_user',
        'password' => 'REEMPLAZAR',
        'charset' => 'utf8mb4',
    ],
    'storage' => [
        'public_root' => '/home/vastyle/public_html/media',
        'public_url' => 'https://vastyle.com.mx/media',
    ],
    'mercadopago' => [
        'access_token' => 'REEMPLAZAR',
        'webhook_secret' => 'REEMPLAZAR',
    ],
    'telegram' => [
        'bot_token' => 'REEMPLAZAR',
        'chat_id' => 'REEMPLAZAR',
    ],
    'security' => [
        'whatsapp_rate_limit_salt' => 'REEMPLAZAR_POR_UN_VALOR_ALEATORIO_LARGO',
    ],
];
