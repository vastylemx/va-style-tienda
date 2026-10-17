-- Halloween first-order promotion for the MariaDB deployment.
-- All timestamps are UTC. 2026-10-16 00:00 through 2026-10-28 23:59:59 America/Mexico_City.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS order_idempotency_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS promo_classification VARCHAR(24) NOT NULL DEFAULT 'not_eligible',
  ADD COLUMN IF NOT EXISTS promo_applied TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_shipping_discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_shipping_quote TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_message TEXT NULL;

SET @has_customer_order_fk = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'orders'
    AND constraint_name = 'orders_customer_fk'
);
SET @add_customer_order_fk = IF(@has_customer_order_fk = 0,
  'ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE add_customer_order_fk_stmt FROM @add_customer_order_fk;
EXECUTE add_customer_order_fk_stmt;
DEALLOCATE PREPARE add_customer_order_fk_stmt;

SET @has_idempotency_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'orders'
    AND index_name = 'orders_idempotency_key_uq'
);
SET @add_idempotency_index = IF(@has_idempotency_index = 0,
  'CREATE UNIQUE INDEX orders_idempotency_key_uq ON orders (order_idempotency_key)',
  'SELECT 1');
PREPARE add_idempotency_index_stmt FROM @add_idempotency_index;
EXECUTE add_idempotency_index_stmt;
DEALLOCATE PREPARE add_idempotency_index_stmt;

SET @has_customer_phone_lookup = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'customers'
    AND column_name = 'phone' AND seq_in_index = 1
);
SET @add_customer_phone_lookup = IF(@has_customer_phone_lookup = 0,
  'CREATE INDEX customers_phone_lookup_idx ON customers (phone)',
  'SELECT 1');
PREPARE add_customer_phone_lookup_stmt FROM @add_customer_phone_lookup;
EXECUTE add_customer_phone_lookup_stmt;
DEALLOCATE PREPARE add_customer_phone_lookup_stmt;

CREATE TABLE IF NOT EXISTS seasonal_promotions (
  promotion_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  starts_at_utc DATETIME(6) NOT NULL,
  ends_at_utc DATETIME(6) NOT NULL,
  texts_json JSON NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (promotion_key),
  CONSTRAINT seasonal_promotions_dates_chk CHECK (ends_at_utc > starts_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seasonal_promotion_redemptions (
  promotion_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  redeemed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (promotion_key, customer_phone),
  KEY seasonal_promo_customer_idx (customer_id),
  UNIQUE KEY seasonal_promo_order_uq (order_id),
  CONSTRAINT seasonal_promo_customer_fk FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE RESTRICT,
  CONSTRAINT seasonal_promo_order_fk FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seasonal_promotion_eligibility_checks (
  client_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_started_at DATETIME(6) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (client_hash),
  KEY seasonal_promo_checks_window_idx (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO seasonal_promotions
  (promotion_key, is_active, starts_at_utc, ends_at_utc, texts_json)
VALUES
  ('halloween-2026', 0, '2026-10-16 06:00:00.000000', '2026-10-29 05:59:59.999999',
   '{"eyebrow":"HALLOWEEN · EDICIÓN ESPECIAL","heading":"Tenemos una sorpresa de Halloween para tu negocio","instruction":"Toca el regalo y descubre tu sorpresa.","opened":"¡ABRISTE TU REGALO DE BIENVENIDA!","benefit":"ENVÍO GRATIS","gift":"REGALO SORPRESA","description":"En tu primer pedido en V&A Style.","button":"QUIERO APROVECHARLO","terms":"En zonas extendidas, únicamente se aplica el costo adicional de cobertura.","footer":"UN DETALLE PARA TI. UN IMPULSO PARA TU NEGOCIO.","whatsappTitle":"PROMOCIÓN HALLOWEEN — PRIMER PEDIDO","whatsappBenefit":"Aplica envío estándar gratis + regalo sorpresa.","whatsappExtended":"En zonas extendidas, únicamente se aplica el costo adicional de cobertura.","whatsappUsed":"Envío gratis de primer pedido: ya utilizado. Este pedido no aplica a la promoción Halloween.","whatsappPrior":"Promoción Halloween: no aplica por tener pedidos anteriores.","whatsappEnded":"Promoción Halloween finalizada."}');
