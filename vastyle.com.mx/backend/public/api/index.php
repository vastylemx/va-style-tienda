<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/src/bootstrap.php';
require_once dirname(__DIR__, 2) . '/src/public_routes.php';
require_once dirname(__DIR__, 2) . '/src/admin_home_routes.php';
require_once dirname(__DIR__, 2) . '/src/admin_misc_routes.php';

function route_path(): string
{
    $path = (string) ($_SERVER['PATH_INFO'] ?? '');
    if ($path === '') {
        $uriPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/api'), PHP_URL_PATH) ?: '/api';
        $path = preg_replace('#^/api(?:/index\.php)?#', '', $uriPath) ?? '';
    }

    $path = trim($path, '/');
    return $path === '' ? 'health' : $path;
}

function bool_value(mixed $value): int
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
}

function clean_string(mixed $value, int $maxLength = 500): string
{
    $clean = trim((string) $value);
    if (mb_strlen($clean, 'UTF-8') > $maxLength) {
        $clean = mb_substr($clean, 0, $maxLength, 'UTF-8');
    }
    return $clean;
}

function money_value(mixed $value): float
{
    $number = (float) $value;
    if (!is_finite($number) || $number < 0) {
        return 0.0;
    }
    return round($number, 2);
}

function normalize_phone(mixed $value): string
{
    $digits = preg_replace('/\D+/', '', (string) $value) ?? '';
    if (str_starts_with($digits, '00')) {
        $digits = substr($digits, 2);
    }
    if (strlen($digits) === 10) {
        $digits = '52' . $digits;
    }
    return substr($digits, 0, 20);
}

function halloween_promo_status(?string $phone = null): array
{
    $row = db()->query(
        'SELECT seasonal_promotions.*,
                (starts_at_utc <= UTC_TIMESTAMP(6) AND ends_at_utc >= UTC_TIMESTAMP(6)) AS within_dates
         FROM seasonal_promotions WHERE promotion_key = "halloween-2026" LIMIT 1'
    )->fetch();
    if (!$row) return ['active' => false, 'eligible' => false];

    $active = (bool) $row['is_active'] && (bool) $row['within_dates'];
    $eligible = $active && ($phone === null || $phone === '') ? null : false;
    if ($active && $phone !== null && $phone !== '') {
        $customer = db()->prepare('SELECT COALESCE(MAX(total_orders), 0) AS total_orders FROM customers WHERE phone = :phone');
        $customer->execute([':phone' => $phone]);
        $customerRow = $customer->fetch();
        $totalOrders = (int) ($customerRow['total_orders'] ?? 0);
        $priorOrder = db()->prepare('SELECT id FROM orders WHERE customer_phone = :phone LIMIT 1');
        $priorOrder->execute([':phone' => $phone]);
        $redeemed = db()->prepare('SELECT order_id FROM seasonal_promotion_redemptions WHERE promotion_key = "halloween-2026" AND customer_phone = :phone LIMIT 1');
        $redeemed->execute([':phone' => $phone]);
        $eligible = $totalOrders === 0 && !$priorOrder->fetchColumn() && !$redeemed->fetchColumn();
    }

    return [
        'active' => $active,
        'eligible' => $eligible,
        'texts' => json_decode((string) $row['texts_json'], true) ?: [],
        'endsAt' => $row['ends_at_utc'],
    ];
}

function halloween_promo_check(): never
{
    require_method('POST');
    $body = request_json();
    $phone = normalize_phone($body['customerPhone'] ?? '');
    if ($phone !== '' && strlen($phone) < 10) json_response(['ok' => false, 'error' => 'Teléfono no válido.'], 422);
    $salt = (string) (config()['security']['whatsapp_rate_limit_salt'] ?? '');
    if ($salt === '') throw new RuntimeException('No está configurada la protección de consultas promocionales.');
    $ipHash = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''), $salt);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $limit = $pdo->prepare(
            'INSERT INTO seasonal_promotion_eligibility_checks (client_hash, window_started_at, request_count)
             VALUES (:hash, UTC_TIMESTAMP(6), 1)
             ON DUPLICATE KEY UPDATE
               request_count = IF(window_started_at <= UTC_TIMESTAMP(6) - INTERVAL 1 HOUR, 1, request_count + 1),
               window_started_at = IF(window_started_at <= UTC_TIMESTAMP(6) - INTERVAL 1 HOUR, UTC_TIMESTAMP(6), window_started_at)'
        );
        $limit->execute([':hash' => $ipHash]);
        $checkLimit = $pdo->prepare('SELECT request_count FROM seasonal_promotion_eligibility_checks WHERE client_hash = :hash FOR UPDATE');
        $checkLimit->execute([':hash' => $ipHash]);
        if ((int) $checkLimit->fetchColumn() > 20) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'Intenta verificar tu beneficio más tarde.'], 429);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_response(['ok' => true, 'promotion' => halloween_promo_status($phone !== '' ? $phone : null)]);
}

function halloween_promo_public_status(): never
{
    require_method('GET');
    json_response(['ok' => true, 'promotion' => halloween_promo_status()]);
}

function build_order_whatsapp_message(array $order, array $items): string
{
    $promoConfig = db()->query('SELECT texts_json FROM seasonal_promotions WHERE promotion_key = "halloween-2026" LIMIT 1')->fetch();
    $promoTexts = json_decode((string) ($promoConfig['texts_json'] ?? ''), true) ?: [];
    $lines = [
        'Hola, comparto mi pedido de V&A Style.',
        'Pedido: #' . $order['id'],
        'Cliente: ' . $order['customer_name'],
        'Teléfono: ' . $order['customer_phone'],
        '',
        'PRODUCTOS:',
    ];
    foreach ($items as $item) {
        $detail = '- ' . $item['quantity'] . ' x ' . $item['name'];
        if ($item['code'] !== '') $detail .= ' [' . $item['code'] . ']';
        if ($item['brand'] !== '') $detail .= ' / ' . $item['brand'];
        if ($item['color'] !== '') $detail .= ' / ' . $item['color'];
        if ($item['size'] !== '') $detail .= ' / Talla ' . $item['size'];
        $lines[] = $detail . ' — $' . number_format((float) $item['line_subtotal'], 2) . ' MXN';
    }
    $lines[] = '';
    $lines[] = 'Subtotal: $' . number_format((float) $order['subtotal'], 2) . ' MXN';
    if ((float) $order['volume_discount'] > 0) $lines[] = 'Descuento mayoreo: -$' . number_format((float) $order['volume_discount'], 2) . ' MXN';
    if ((int) $order['promo_applied'] === 1) {
        $lines[] = '🎃 *' . ($promoTexts['whatsappTitle'] ?? 'PROMOCIÓN HALLOWEEN — PRIMER PEDIDO') . '*';
        $lines[] = '✅ *' . ($promoTexts['whatsappBenefit'] ?? 'Aplica envío estándar gratis + regalo sorpresa.') . '*';
        $lines[] = '📦 *' . ($promoTexts['whatsappExtended'] ?? 'En zonas extendidas, únicamente se aplica el costo adicional de cobertura.') . '*';
    } elseif ((string) $order['promo_classification'] === 'used') {
        $lines[] = '*' . ($promoTexts['whatsappUsed'] ?? 'Envío gratis de primer pedido: ya utilizado. Este pedido no aplica a la promoción Halloween.') . '*';
    } elseif ((string) $order['promo_classification'] === 'prior_order') {
        $lines[] = '*' . ($promoTexts['whatsappPrior'] ?? 'Promoción Halloween: no aplica por tener pedidos anteriores.') . '*';
    } elseif ((string) $order['promo_classification'] === 'expired') {
        $lines[] = '*' . ($promoTexts['whatsappEnded'] ?? 'Promoción Halloween finalizada.') . '*';
    }
    if ((int) $order['needs_shipping_quote'] === 1) {
        $lines[] = 'Envío/cobertura: pendiente de cotización con la asesora.';
    } elseif ((int) $order['promo_applied'] === 1) {
        $lines[] = 'Envío estándar: gratis.';
    } else {
        $lines[] = 'Envío: $' . number_format((float) $order['shipping_cost'], 2) . ' MXN';
    }
    $lines[] = 'TOTAL: $' . number_format((float) $order['total'], 2) . ' MXN' . ((int) $order['needs_shipping_quote'] ? ' + cotización pendiente' : '');
    return implode("\n", $lines);
}

function normalize_order_items(mixed $items): array
{
    if (!is_array($items) || $items === [] || count($items) > 100) {
        json_response(['ok' => false, 'error' => 'El pedido no contiene productos válidos.'], 422);
    }

    $normalized = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $quantity = max(1, min(1000, (int) ($item['quantity'] ?? 1)));
        $unitPrice = money_value($item['unitPrice'] ?? $item['price'] ?? 0);
        $name = clean_string($item['name'] ?? $item['code'] ?? 'Producto', 200);
        $code = clean_string($item['code'] ?? '', 100);

        if ($name === '' && $code === '') {
            continue;
        }

        $normalized[] = [
            'product_id' => isset($item['productId']) ? (int) $item['productId'] : null,
            'code' => $code,
            'name' => $name !== '' ? $name : $code,
            'brand' => clean_string($item['brand'] ?? '', 160),
            'color' => clean_string($item['color'] ?? '', 100),
            'size' => clean_string($item['size'] ?? '', 60),
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'line_subtotal' => round($quantity * $unitPrice, 2),
        ];
    }

    if ($normalized === []) {
        json_response(['ok' => false, 'error' => 'El pedido no contiene productos válidos.'], 422);
    }

    return $normalized;
}

function product_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'brand' => $row['brand'],
        'category' => $row['category'],
        'sizes' => $row['sizes'],
        'discount_percent' => (float) $row['discount_percent'],
        'is_new_arrival' => (bool) $row['is_new_arrival_visible'],
        'new_arrival_started_at' => $row['new_arrival_started_at'],
        'is_outlet' => (bool) $row['is_outlet'],
        'original_category' => $row['original_category'],
        'outlet_price' => $row['outlet_price'] === null ? null : (float) $row['outlet_price'],
        'last_pieces' => (bool) $row['last_pieces'],
        'is_best_seller' => (bool) $row['is_best_seller'],
        'is_home_featured' => (bool) $row['is_home_featured'],
        'wholesale_price' => (float) $row['wholesale_price'],
        'shipping_factor' => (float) $row['shipping_factor'],
        'image_url' => $row['image_url'],
        'created_at' => $row['created_at'],
    ];
}

function review_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'customer_name' => $row['customer_name'],
        'rating' => (int) $row['rating'],
        'comment' => $row['comment'],
        'media_url' => $row['media_url'],
        'media_type' => $row['media_type'],
        'approved' => (bool) $row['approved'],
        'created_at' => $row['created_at'],
    ];
}

function list_products(): never
{
    require_method('GET');
    $database = db();
    $database->exec(
        'UPDATE products
         SET is_new_arrival = 0, new_arrival_started_at = NULL
         WHERE is_new_arrival = 1
           AND (new_arrival_started_at IS NULL
                OR new_arrival_started_at <= UTC_TIMESTAMP(6) - INTERVAL 20 DAY)'
    );
    $stmt = $database->query(
        'SELECT products.*,
                IF(is_new_arrival = 1 AND new_arrival_started_at IS NOT NULL
                   AND new_arrival_started_at > UTC_TIMESTAMP(6) - INTERVAL 20 DAY, 1, 0)
                   AS is_new_arrival_visible
         FROM products ORDER BY created_at DESC'
    );
    $products = array_map('product_row', $stmt->fetchAll());
    json_response(['ok' => true, 'data' => $products]);
}

function list_reviews(): never
{
    require_method('GET');
    $stmt = db()->query('SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC');
    $reviews = array_map('review_row', $stmt->fetchAll());
    json_response(['ok' => true, 'data' => $reviews]);
}

function create_review(): never
{
    require_method('POST');
    $body = request_json();

    $customerName = clean_string($body['customer_name'] ?? $body['name'] ?? '', 200);
    $comment = clean_string($body['comment'] ?? '', 5000);
    $rating = max(1, min(5, (int) ($body['rating'] ?? 5)));
    $mediaUrl = clean_string($body['media_url'] ?? '', 1200);
    $mediaType = clean_string($body['media_type'] ?? '', 20);

    if ($customerName === '' || $comment === '') {
        json_response(['ok' => false, 'error' => 'Nombre y comentario son obligatorios.'], 422);
    }
    if ($mediaUrl !== '' && !is_local_media_url($mediaUrl, '/media/reviews/')) {
        json_response(['ok' => false, 'error' => 'El archivo de reseña debe cargarse en V&A Style.'], 422);
    }

    $stmt = db()->prepare(
        'INSERT INTO reviews (customer_name, rating, comment, media_url, media_type, approved)
         VALUES (:customer_name, :rating, :comment, :media_url, :media_type, 0)'
    );
    $stmt->execute([
        ':customer_name' => $customerName,
        ':rating' => $rating,
        ':comment' => $comment,
        ':media_url' => $mediaUrl,
        ':media_type' => $mediaType,
    ]);

    json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
}

function home_settings(): never
{
    require_method('GET');
    $stmt = db()->query('SELECT * FROM home_settings WHERE id = 1 LIMIT 1');
    json_response(['ok' => true, 'data' => $stmt->fetch() ?: null]);
}

function home_content(): never
{
    require_method('GET');

    $sections = db()
        ->query("SELECT * FROM home_sections
                 WHERE is_active = 1 AND visibility_mode <> 'inactive'
                   AND (start_at IS NULL OR start_at <= UTC_TIMESTAMP(6))
                   AND (end_at IS NULL OR end_at >= UTC_TIMESTAMP(6))
                 ORDER BY display_order ASC, id ASC")
        ->fetchAll();
    $banners = db()
        ->query('SELECT * FROM home_banners
                 WHERE is_active = 1
                   AND (start_at IS NULL OR start_at <= UTC_TIMESTAMP(6))
                   AND (end_at IS NULL OR end_at >= UTC_TIMESTAMP(6))
                 ORDER BY display_order ASC, id ASC')
        ->fetchAll();
    $categories = db()
        ->query('SELECT * FROM featured_categories
                 WHERE is_active = 1
                   AND (start_at IS NULL OR start_at <= UTC_TIMESTAMP(6))
                   AND (end_at IS NULL OR end_at >= UTC_TIMESTAMP(6))
                 ORDER BY display_order ASC, id ASC')
        ->fetchAll();

    json_response([
        'ok' => true,
        'data' => [
            'sections' => $sections,
            'banners' => $banners,
            'featured_categories' => $categories,
        ],
    ]);
}

function showroom_arrivals(): never
{
    require_method('GET');
    $stmt = db()->query('SELECT * FROM showroom_arrivals ORDER BY created_at DESC');
    json_response(['ok' => true, 'data' => $stmt->fetchAll()]);
}

function community_posts(): never
{
    require_method('GET');
    $stmt = db()->query(
        'SELECT * FROM community_posts WHERE active = 1 ORDER BY is_pinned DESC, created_at DESC'
    );
    json_response(['ok' => true, 'data' => $stmt->fetchAll()]);
}

function create_order(): never
{
    require_method('POST');
    $body = request_json();

    $customerName = clean_string($body['customer_name'] ?? '', 200);
    $customerPhone = clean_string($body['customer_phone'] ?? '', 20);
    if ($customerName === '' || $customerPhone === '') {
        json_response(['ok' => false, 'error' => 'Nombre y teléfono son obligatorios.'], 422);
    }

    $paymentMethod = clean_string($body['payment_method'] ?? 'asesor', 40);
    if ($paymentMethod !== 'asesor') {
        json_response([
            'ok' => false,
            'error' => 'Mercado Pago no está habilitado en esta migración.',
        ], 409);
    }

    $stmt = db()->prepare(
        'INSERT INTO orders
          (customer_name, customer_phone, subtotal, shipping_units, shipping_cost, service_fee,
           volume_discount, total, payment_method, payment_status, order_status, status, archived)
         VALUES
          (:customer_name, :customer_phone, :subtotal, :shipping_units, :shipping_cost, :service_fee,
           :volume_discount, :total, :payment_method, :payment_status, :order_status, :status, 0)'
    );
    $stmt->execute([
        ':customer_name' => $customerName,
        ':customer_phone' => $customerPhone,
        ':subtotal' => (float) ($body['subtotal'] ?? 0),
        ':shipping_units' => (int) ($body['shipping_units'] ?? 0),
        ':shipping_cost' => (float) ($body['shipping_cost'] ?? 0),
        ':service_fee' => (float) ($body['service_fee'] ?? 0),
        ':volume_discount' => (float) ($body['volume_discount'] ?? 0),
        ':total' => (float) ($body['total'] ?? 0),
        ':payment_method' => $paymentMethod,
        ':payment_status' => clean_string($body['payment_status'] ?? 'pending', 40),
        ':order_status' => clean_string($body['order_status'] ?? 'pending', 40),
        ':status' => clean_string($body['status'] ?? 'pending', 40),
    ]);

    json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
}

function create_advisor_order(): never
{
    require_method('POST');
    $body = request_json();

    $customerName = clean_string($body['customerName'] ?? $body['customer_name'] ?? '', 200);
    $customerPhone = normalize_phone($body['customerPhone'] ?? $body['customer_phone'] ?? '');
    $items = normalize_order_items($body['items'] ?? []);
    $requestId = clean_string($body['requestId'] ?? '', 36);
    if ($requestId === '') {
        $uuid = random_bytes(16);
        $uuid[6] = chr((ord($uuid[6]) & 0x0f) | 0x40);
        $uuid[8] = chr((ord($uuid[8]) & 0x3f) | 0x80);
        $hex = bin2hex($uuid);
        $requestId = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    if (array_sum(array_column($items, 'quantity')) < 12) {
        json_response(['ok' => false, 'error' => 'Pedido mínimo: 12 piezas.'], 422);
    }

    if ($customerName === '' || strlen($customerPhone) < 10 || !preg_match('/^[a-f0-9-]{36}$/i', $requestId)) {
        json_response(['ok' => false, 'error' => 'Nombre, teléfono o identificador de solicitud no válidos.'], 422);
    }

    $subtotal = money_value($body['subtotal'] ?? array_sum(array_column($items, 'line_subtotal')));
    $volumeDiscount = money_value($body['volumeDiscount'] ?? $body['volume_discount'] ?? 0);
    $shippingCost = money_value($body['shippingCost'] ?? $body['shipping_cost'] ?? 0);
    $needsShippingQuote = bool_value($body['needsShippingQuote'] ?? $body['needs_shipping_quote'] ?? false);
    $total = max($subtotal - $volumeDiscount + ($needsShippingQuote ? 0 : $shippingCost), 0);

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $retry = $pdo->prepare('SELECT * FROM orders WHERE order_idempotency_key = :request_id LIMIT 1 FOR UPDATE');
        $retry->execute([':request_id' => $requestId]);
        $existingOrder = $retry->fetch();
        if ($existingOrder) {
            $existingItems = $pdo->prepare('SELECT * FROM order_items WHERE order_id = :id ORDER BY id');
            $existingItems->execute([':id' => $existingOrder['id']]);
            $message = (string) ($existingOrder['whatsapp_message'] ?? '');
            if ($message === '') $message = build_order_whatsapp_message($existingOrder, $existingItems->fetchAll());
            $pdo->commit();
            json_response([
                'ok' => true,
                'orderId' => (int) $existingOrder['id'],
                'promotion' => ['classification' => $existingOrder['promo_classification'], 'applied' => (bool) $existingOrder['promo_applied']],
                'whatsappMessage' => $message,
                'telegram' => 'disabled',
                'retry' => true,
            ], 200);
        }

        $configStmt = $pdo->query('SELECT * FROM seasonal_promotions WHERE promotion_key = "halloween-2026" LIMIT 1');
        $promo = $configStmt->fetch();
        $nowStmt = $pdo->query('SELECT UTC_TIMESTAMP(6) AS utc_now');
        $nowUtc = (string) $nowStmt->fetchColumn();
        $promoActive = $promo && (int) $promo['is_active'] === 1 &&
            $nowUtc >= (string) $promo['starts_at_utc'] && $nowUtc <= (string) $promo['ends_at_utc'];

        $customerStmt = $pdo->prepare('SELECT id, total_orders FROM customers WHERE phone = :phone ORDER BY total_orders DESC, id ASC LIMIT 1 FOR UPDATE');
        $customerStmt->execute([':phone' => $customerPhone]);
        $customerRow = $customerStmt->fetch();
        if (!$customerRow) {
            $customerInsert = $pdo->prepare(
                'INSERT INTO customers (name, phone, total_orders, total_spent, last_order_date)
                 VALUES (:name, :phone, 0, 0, UTC_TIMESTAMP(6))'
            );
            $customerInsert->execute([':name' => $customerName, ':phone' => $customerPhone]);
            $customerRow = ['id' => (int) $pdo->lastInsertId(), 'total_orders' => 0];
        }
        $customerId = (int) $customerRow['id'];
        $customerOrders = (int) $customerRow['total_orders'];
        $priorOrderStmt = $pdo->prepare('SELECT id FROM orders WHERE customer_phone = :phone LIMIT 1 FOR UPDATE');
        $priorOrderStmt->execute([':phone' => $customerPhone]);
        $hasPriorOrder = (bool) $priorOrderStmt->fetchColumn();
        $redemptionStmt = $pdo->prepare('SELECT order_id FROM seasonal_promotion_redemptions WHERE promotion_key = "halloween-2026" AND customer_phone = :phone LIMIT 1 FOR UPDATE');
        $redemptionStmt->execute([':phone' => $customerPhone]);
        $hasRedeemed = (bool) $redemptionStmt->fetchColumn();

        $promoApplied = (bool) $promoActive && $customerOrders === 0 && !$hasPriorOrder && !$hasRedeemed;
        $promoClassification = $promoApplied ? 'applied'
            : (!$promoActive ? 'expired'
                : ($hasRedeemed ? 'used'
                    : (($customerOrders > 0 || $hasPriorOrder) ? 'prior_order' : 'not_eligible')));
        if ($promoApplied) $shippingCost = 0.0;
        $total = max($subtotal - $volumeDiscount + ($needsShippingQuote ? 0 : $shippingCost), 0);

        $orderStmt = $pdo->prepare(
            'INSERT INTO orders
              (customer_name, customer_phone, subtotal, shipping_units, shipping_cost, service_fee,
               volume_discount, total, payment_method, payment_status, order_status, status, archived,
               customer_id, order_idempotency_key, promo_code, promo_classification, promo_applied, promo_shipping_discount,
               needs_shipping_quote, whatsapp_message)
             VALUES
              (:customer_name, :customer_phone, :subtotal, :shipping_units, :shipping_cost, 0,
               :volume_discount, :total, "asesor", "pending", "pending", "pending", 0,
               :customer_id, :request_id, :promo_code, :promo_classification, :promo_applied, :promo_shipping_discount,
               :needs_shipping_quote, "")'
        );
        $orderStmt->execute([
            ':customer_name' => $customerName,
            ':customer_phone' => $customerPhone,
            ':subtotal' => $subtotal,
            ':shipping_units' => array_sum(array_column($items, 'quantity')),
            ':shipping_cost' => $shippingCost,
            ':volume_discount' => $volumeDiscount,
            ':total' => $total,
            ':customer_id' => $customerId,
            ':request_id' => $requestId,
            ':promo_code' => $promoApplied ? 'HALLOWEEN-2026' : null,
            ':promo_classification' => $promoClassification,
            ':promo_applied' => $promoApplied ? 1 : 0,
            ':promo_shipping_discount' => $promoApplied && !$needsShippingQuote ? money_value($body['shippingCost'] ?? 0) : 0,
            ':needs_shipping_quote' => $needsShippingQuote ? 1 : 0,
        ]);

        $orderId = (int) $pdo->lastInsertId();
        $itemStmt = $pdo->prepare(
            'INSERT INTO order_items
              (order_id, product_id, code, name, brand, color, size, quantity, unit_price, line_subtotal)
             VALUES
              (:order_id, :product_id, :code, :name, :brand, :color, :size, :quantity, :unit_price, :line_subtotal)'
        );

        foreach ($items as $item) {
            $itemStmt->execute([
                ':order_id' => $orderId,
                ':product_id' => $item['product_id'],
                ':code' => $item['code'],
                ':name' => $item['name'],
                ':brand' => $item['brand'],
                ':color' => $item['color'],
                ':size' => $item['size'],
                ':quantity' => $item['quantity'],
                ':unit_price' => $item['unit_price'],
                ':line_subtotal' => $item['line_subtotal'],
            ]);
        }

        $customerUpdate = $pdo->prepare(
            'UPDATE customers SET name = :name, total_orders = total_orders + 1,
             total_spent = total_spent + :total, last_order_date = UTC_TIMESTAMP(6) WHERE id = :customer_id'
        );
        $customerUpdate->execute([
            ':name' => $customerName,
            ':total' => $total,
            ':customer_id' => $customerId,
        ]);

        if ($promoApplied) {
            $redeem = $pdo->prepare(
                'INSERT INTO seasonal_promotion_redemptions (promotion_key, customer_id, customer_phone, order_id)
                 VALUES ("halloween-2026", :customer_id, :phone, :order_id)'
            );
            $redeem->execute([':customer_id' => $customerId, ':phone' => $customerPhone, ':order_id' => $orderId]);
        }

        $savedOrderStmt = $pdo->prepare('SELECT * FROM orders WHERE id = :id');
        $savedOrderStmt->execute([':id' => $orderId]);
        $savedOrder = $savedOrderStmt->fetch();
        $itemsForMessage = $pdo->prepare('SELECT * FROM order_items WHERE order_id = :id ORDER BY id');
        $itemsForMessage->execute([':id' => $orderId]);
        $whatsappMessage = build_order_whatsapp_message($savedOrder, $itemsForMessage->fetchAll());
        $saveMessage = $pdo->prepare('UPDATE orders SET whatsapp_message = :message WHERE id = :id');
        $saveMessage->execute([':message' => $whatsappMessage, ':id' => $orderId]);

        $pdo->commit();
        json_response([
            'ok' => true,
            'orderId' => $orderId,
            'promotion' => ['classification' => $promoClassification, 'applied' => $promoApplied],
            'whatsappMessage' => $whatsappMessage,
            'telegram' => 'disabled',
        ], 201);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($error instanceof PDOException && $error->getCode() === '23000') {
            $retry = $pdo->prepare('SELECT * FROM orders WHERE order_idempotency_key = :request_id LIMIT 1');
            $retry->execute([':request_id' => $requestId]);
            $existingOrder = $retry->fetch();
            if ($existingOrder) {
                $existingItems = $pdo->prepare('SELECT * FROM order_items WHERE order_id = :id ORDER BY id');
                $existingItems->execute([':id' => $existingOrder['id']]);
                $message = (string) ($existingOrder['whatsapp_message'] ?? '');
                if ($message === '') $message = build_order_whatsapp_message($existingOrder, $existingItems->fetchAll());
                json_response([
                    'ok' => true,
                    'orderId' => (int) $existingOrder['id'],
                    'promotion' => ['classification' => $existingOrder['promo_classification'], 'applied' => (bool) $existingOrder['promo_applied']],
                    'whatsappMessage' => $message,
                    'telegram' => 'disabled',
                    'retry' => true,
                ], 200);
            }
        }
        throw $error;
    }
}

function admin_login(): never
{
    require_method('POST');
    $body = request_json();
    $email = strtolower(clean_string($body['email'] ?? '', 254));
    $password = (string) ($body['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '' || strlen($password) > 1024) {
        json_response(['ok' => false, 'error' => 'Correo o contraseña incorrectos.'], 401);
    }

    $stmt = db()->prepare(
        'SELECT id, email, password_hash, is_active FROM admin_users WHERE email = :email LIMIT 1'
    );
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();
    $hash = is_array($user) ? (string) $user['password_hash'] : '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
    $passwordValid = password_verify($password, $hash);

    if (!$user || (int) $user['is_active'] !== 1 || !$passwordValid) {
        json_response(['ok' => false, 'error' => 'Correo o contraseña incorrectos.'], 401);
    }

    start_secure_session();
    session_regenerate_id(true);
    $_SESSION['admin'] = [
        'id' => (int) $user['id'],
        'email' => (string) $user['email'],
    ];
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    $update = db()->prepare('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP(6) WHERE id = :id');
    $update->execute([':id' => (int) $user['id']]);

    json_response([
        'ok' => true,
        'admin' => $_SESSION['admin'],
        'csrfToken' => $_SESSION['csrf_token'],
    ]);
}

function admin_me(): never
{
    require_method('GET');
    $admin = require_admin();
    json_response(['ok' => true, 'admin' => $admin, 'csrfToken' => csrf_token()]);
}

function admin_logout(): never
{
    require_method('POST');
    require_admin();
    require_csrf();

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }
    session_destroy();
    json_response(['ok' => true]);
}

function disabled_integration(string $name): never
{
    json_response([
        'ok' => false,
        'error' => sprintf('%s no está habilitado en esta etapa de la migración.', $name),
    ], 501);
}

try {
    $route = route_path();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    match ($route) {
        'health' => json_response(['ok' => true, 'service' => 'V&A Style API']),
        'products' => list_products(),
        'reviews' => $method === 'POST' ? create_review() : list_reviews(),
        'upload-review-media' => upload_review_media(),
        'showroom-arrivals' => showroom_arrivals(),
        'home-settings' => home_settings(),
        'home-content' => home_content(),
        'community-posts' => community_posts(),
        'community-likes' => community_likes(),
        'orders' => create_order(),
        'send-advisor-order' => create_advisor_order(),
        'halloween-promo/status' => halloween_promo_public_status(),
        'halloween-promo/check' => halloween_promo_check(),
        'whatsapp/assign' => advisor_assignment(),
        'advisor-lines' => public_advisor_lines(),
        'admin/login' => admin_login(),
        'admin/me' => admin_me(),
        'admin/logout' => admin_logout(),
        'admin/home-config' => admin_home_config(),
        'admin/home-banner-media' => upload_admin_home_banner_media(),
        'admin/orders' => admin_orders(),
        'admin/whatsapp-lines' => admin_whatsapp_lines(),
        'admin/review' => admin_reviews(),
        'admin/home-settings' => admin_home_settings(),
        'admin/showroom' => admin_showroom(),
        'admin/showroom-media' => admin_showroom_media(),
        'create-preference' => disabled_integration('Mercado Pago'),
        'mercadopago-webhook' => disabled_integration('Mercado Pago'),
        'send-telegram' => disabled_integration('Telegram'),
        default => json_response(['ok' => false, 'error' => 'Ruta no encontrada.'], 404),
    };
} catch (Throwable $error) {
    handle_unexpected_error($error);
}
