<?php
declare(strict_types=1);

function mig_token(): void
{
    $settings = config();
    $expected = (string) ($settings['app']['installer_token'] ?? $settings['security']['installer_token'] ?? '');
    $provided = (string) ($_SERVER['HTTP_X_MIGRATION_TOKEN'] ?? '');
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        json_response(['ok' => false, 'error' => 'Token de migración inválido.'], 403);
    }
}

function mig_dt(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable((string) $value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    } catch (Throwable) {
        return null;
    }
}

function mig_s(mixed $value, int $max = 1200): string
{
    $text = trim((string) ($value ?? ''));
    return mb_strlen($text, 'UTF-8') > $max ? mb_substr($text, 0, $max, 'UTF-8') : $text;
}

function mig_j(mixed $value): string
{
    if ($value === null || $value === '') {
        return '{}';
    }
    if (is_string($value)) {
        json_decode($value);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $value;
        }
    }
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
}

function mig_insert(PDO $pdo, string $table, array $rows): int
{
    if ($rows === []) {
        return 0;
    }
    $columns = array_keys($rows[0]);
    $quoted = [];
    $holders = [];
    foreach ($columns as $column) {
        $quoted[] = "`$column`";
        $holders[] = ":$column";
    }
    $stmt = $pdo->prepare(sprintf(
        'INSERT INTO `%s` (%s) VALUES (%s)',
        $table,
        implode(', ', $quoted),
        implode(', ', $holders)
    ));
    $count = 0;
    foreach ($rows as $row) {
        $stmt->execute($row);
        $count++;
    }
    return $count;
}

function migration_import_data(): never
{
    require_method('POST');
    mig_token();

    $path = '/home/vastyle/migration_candidate/data/supabase-export.json';
    $payload = json_decode((string) file_get_contents($path), true);
    if (!is_array($payload) || !is_array($payload['tables'] ?? null)) {
        json_response(['ok' => false, 'error' => 'Archivo de migración inválido.'], 422);
    }

    $tables = $payload['tables'];
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['community_posts', 'featured_categories', 'home_banners', 'home_sections', 'home_settings', 'showroom_arrivals', 'reviews', 'products'] as $table) {
            $pdo->exec("TRUNCATE TABLE `$table`");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $now = date('Y-m-d H:i:s.u');
        $counts = [];
        $rows = [];
        foreach ($tables['products'] ?? [] as $r) {
            $rows[] = [
                'name' => mig_s($r['name'] ?? '', 200),
                'brand' => mig_s($r['brand'] ?? '', 160),
                'category' => mig_s($r['category'] ?? '', 120),
                'sizes' => mig_s($r['sizes'] ?? '', 255),
                'discount_percent' => (float) ($r['discount_percent'] ?? 0),
                'is_new_arrival' => filter_var($r['is_new_arrival'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'is_best_seller' => filter_var($r['is_best_seller'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'is_home_featured' => filter_var($r['is_home_featured'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'wholesale_price' => (float) ($r['wholesale_price'] ?? 0),
                'shipping_factor' => (float) ($r['shipping_factor'] ?? 1),
                'image_url' => mig_s($r['image_url'] ?? '', 1200),
                'created_at' => mig_dt($r['created_at'] ?? null) ?? $now,
            ];
        }
        $counts['products'] = mig_insert($pdo, 'products', $rows);

        $rows = [];
        foreach ($tables['reviews'] ?? [] as $r) {
            $rows[] = [
                'customer_name' => mig_s($r['customer_name'] ?? $r['name'] ?? '', 200),
                'rating' => max(1, min(5, (int) ($r['rating'] ?? 5))),
                'comment' => mig_s($r['comment'] ?? '', 5000),
                'media_url' => mig_s($r['media_url'] ?? '', 1200),
                'media_type' => mig_s($r['media_type'] ?? '', 20),
                'approved' => filter_var($r['approved'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'created_at' => mig_dt($r['created_at'] ?? null) ?? $now,
            ];
        }
        $counts['reviews'] = mig_insert($pdo, 'reviews', $rows);

        $rows = [];
        foreach ($tables['showroom_arrivals'] ?? [] as $r) {
            $rows[] = [
                'title' => mig_s($r['title'] ?? 'SHOWROOM', 160),
                'codes' => is_array($r['codes'] ?? null) ? implode(', ', $r['codes']) : mig_s($r['codes'] ?? '', 5000),
                'description' => mig_s($r['description'] ?? '', 5000),
                'image_url' => mig_s($r['image_url'] ?? '', 1200),
                'created_at' => mig_dt($r['created_at'] ?? null) ?? $now,
            ];
        }
        $counts['showroom_arrivals'] = mig_insert($pdo, 'showroom_arrivals', $rows);

        $rows = [];
        foreach ($tables['home_settings'] ?? [] as $r) {
            $rows[] = [
                'id' => 1,
                'hero_image_url' => mig_s($r['hero_image_url'] ?? '', 1200),
                'new_arrivals_image_url' => mig_s($r['new_arrivals_image_url'] ?? '', 1200),
                'best_sellers_image_url' => mig_s($r['best_sellers_image_url'] ?? '', 1200),
                'hero_title' => mig_s($r['hero_title'] ?? '', 200),
                'hero_subtitle' => mig_s($r['hero_subtitle'] ?? '', 500),
                'new_arrivals_title' => mig_s($r['new_arrivals_title'] ?? '', 200),
                'new_arrivals_subtitle' => mig_s($r['new_arrivals_subtitle'] ?? '', 500),
                'best_sellers_title' => mig_s($r['best_sellers_title'] ?? '', 200),
                'best_sellers_subtitle' => mig_s($r['best_sellers_subtitle'] ?? '', 500),
                'show_install_banner' => filter_var($r['show_install_banner'] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'install_banner_title' => mig_s($r['install_banner_title'] ?? '', 200),
                'install_banner_subtitle' => mig_s($r['install_banner_subtitle'] ?? '', 500),
                'updated_at' => mig_dt($r['updated_at'] ?? null) ?? $now,
            ];
        }
        $counts['home_settings'] = mig_insert($pdo, 'home_settings', $rows);

        $rows = [];
        foreach ($tables['home_sections'] ?? [] as $r) {
            $mode = $r['visibility_mode'] ?? 'automatic';
            $rows[] = [
                'section_key' => mig_s($r['section_key'] ?? '', 80),
                'title' => $r['title'] ?? null,
                'subtitle' => $r['subtitle'] ?? null,
                'is_active' => filter_var($r['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'visibility_mode' => in_array($mode, ['active', 'inactive', 'automatic'], true) ? $mode : 'automatic',
                'display_order' => (int) ($r['display_order'] ?? 0),
                'display_type' => mig_s($r['display_type'] ?? 'grid', 40),
                'item_limit' => max(1, min(50, (int) ($r['item_limit'] ?? 8))),
                'show_view_all' => filter_var($r['show_view_all'] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'destination' => $r['destination'] ?? null,
                'start_at' => mig_dt($r['start_at'] ?? null),
                'end_at' => mig_dt($r['end_at'] ?? null),
                'settings' => mig_j($r['settings'] ?? []),
                'created_at' => mig_dt($r['created_at'] ?? null) ?? $now,
                'updated_at' => mig_dt($r['updated_at'] ?? null) ?? $now,
            ];
        }
        $counts['home_sections'] = mig_insert($pdo, 'home_sections', $rows);

        $counts['home_banners'] = mig_insert($pdo, 'home_banners', []);
        $counts['featured_categories'] = mig_insert($pdo, 'featured_categories', []);

        $rows = [];
        foreach ($tables['community_posts'] ?? [] as $r) {
            $rows[] = [
                'media_url' => mig_s($r['media_url'] ?? '', 1200),
                'media_type' => ($r['media_type'] ?? 'image') === 'video' ? 'video' : 'image',
                'text' => mig_s($r['text'] ?? '', 200),
                'advisor_line' => max(0, min(5, (int) ($r['advisor_line'] ?? 0))),
                'active' => filter_var($r['active'] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'is_pinned' => filter_var($r['is_pinned'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
                'likes_count' => max(0, (int) ($r['likes_count'] ?? 0)),
                'whatsapp_clicks' => max(0, (int) ($r['whatsapp_clicks'] ?? 0)),
                'views_count' => max(0, (int) ($r['views_count'] ?? 0)),
                'created_at' => mig_dt($r['created_at'] ?? null) ?? $now,
                'updated_at' => mig_dt($r['updated_at'] ?? null) ?? $now,
            ];
        }
        $counts['community_posts'] = mig_insert($pdo, 'community_posts', $rows);

        $pdo->commit();
        json_response(['ok' => true, 'counts' => $counts]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        throw $error;
    }
}
