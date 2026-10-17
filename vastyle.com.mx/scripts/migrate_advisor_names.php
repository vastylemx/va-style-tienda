<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

try {
    require_method('POST');
    require_admin();
    require_csrf();

    $pdo = db();
    $column = $pdo->query("SHOW COLUMNS FROM whatsapp_advisor_lines LIKE 'display_name'")->fetch();
    if (!$column) {
        $pdo->exec("ALTER TABLE whatsapp_advisor_lines ADD COLUMN display_name VARCHAR(80) NOT NULL DEFAULT '' AFTER phone_number");
    }

    $names = [
        1 => 'NOEMI GOMEZ',
        2 => 'VENDEDOR',
        3 => 'ALEJANDRO VEGA',
        4 => 'LUIS AVILA',
        5 => 'VENDEDOR',
    ];
    $update = $pdo->prepare("UPDATE whatsapp_advisor_lines SET display_name = :name WHERE id = :id AND display_name = ''");
    foreach ($names as $id => $name) {
        $update->execute([':id' => $id, ':name' => $name]);
    }

    $lines = $pdo->query(
        'SELECT id, phone_number, display_name, is_active, display_order
         FROM whatsapp_advisor_lines ORDER BY display_order ASC, id ASC'
    )->fetchAll();
    if (count($lines) !== 5 || count(array_filter($lines, static fn (array $line): bool => trim($line['display_name']) !== '')) !== 5) {
        throw new RuntimeException('La verificación de nombres de asesores no pasó.');
    }
    json_response(['ok' => true, 'lines' => $lines]);
} catch (Throwable $error) {
    handle_unexpected_error($error);
}
