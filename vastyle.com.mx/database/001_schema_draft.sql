-- BORRADOR PARA REVISION. NO IMPORTAR EN PRODUCCION TODAVIA.
-- Inferido del codigo y de las migraciones locales de Supabase.
-- Los tipos de IDs y relaciones deben cotejarse con el dump remoto antes de aprobarse.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY admin_users_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(160) NOT NULL DEFAULT '',
  category VARCHAR(120) NOT NULL,
  sizes VARCHAR(255) NOT NULL DEFAULT '',
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_new_arrival TINYINT(1) NOT NULL DEFAULT 0,
  is_best_seller TINYINT(1) NOT NULL DEFAULT 0,
  is_home_featured TINYINT(1) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(12,2) NOT NULL,
  shipping_factor DECIMAL(8,2) NOT NULL DEFAULT 1,
  image_url VARCHAR(1200) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY products_created_idx (created_at),
  KEY products_category_idx (category),
  KEY products_flags_idx (is_new_arrival, is_best_seller, is_home_featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  total_orders INT UNSIGNED NOT NULL DEFAULT 0,
  total_spent DECIMAL(14,2) NOT NULL DEFAULT 0,
  last_order_date DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY customers_phone_uq (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipping_units INT UNSIGNED NOT NULL DEFAULT 0,
  shipping_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  service_fee DECIMAL(14,2) NOT NULL DEFAULT 0,
  volume_discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(40) NOT NULL,
  payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  order_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  status VARCHAR(40) NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  mercado_pago_payment_id VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY orders_created_idx (created_at),
  KEY orders_archived_created_idx (archived, created_at),
  KEY orders_payment_id_idx (mercado_pago_payment_id),
  KEY orders_customer_phone_idx (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  code VARCHAR(100) NOT NULL DEFAULT '',
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(160) NOT NULL DEFAULT '',
  color VARCHAR(100) NOT NULL DEFAULT '',
  size VARCHAR(60) NOT NULL DEFAULT '',
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY order_items_order_idx (order_id),
  KEY order_items_product_idx (product_id),
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE SET NULL,
  CONSTRAINT order_items_quantity_chk CHECK (quantity BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(200) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
  comment TEXT NOT NULL,
  media_url VARCHAR(1200) NOT NULL DEFAULT '',
  media_type VARCHAR(20) NOT NULL DEFAULT '',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY reviews_approved_created_idx (approved, created_at),
  CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS showroom_arrivals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL DEFAULT 'SHOWROOM',
  codes TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(1200) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY showroom_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS home_settings (
  id TINYINT UNSIGNED NOT NULL,
  hero_image_url VARCHAR(1200) NOT NULL DEFAULT '',
  new_arrivals_image_url VARCHAR(1200) NOT NULL DEFAULT '',
  best_sellers_image_url VARCHAR(1200) NOT NULL DEFAULT '',
  hero_title VARCHAR(200) NOT NULL,
  hero_subtitle VARCHAR(500) NOT NULL,
  new_arrivals_title VARCHAR(200) NOT NULL,
  new_arrivals_subtitle VARCHAR(500) NOT NULL,
  best_sellers_title VARCHAR(200) NOT NULL,
  best_sellers_subtitle VARCHAR(500) NOT NULL,
  show_install_banner TINYINT(1) NOT NULL DEFAULT 1,
  install_banner_title VARCHAR(200) NOT NULL,
  install_banner_subtitle VARCHAR(500) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS home_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_key VARCHAR(80) NOT NULL,
  title VARCHAR(200) NULL,
  subtitle VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  visibility_mode ENUM('active','inactive','automatic') NOT NULL DEFAULT 'automatic',
  display_order INT NOT NULL DEFAULT 0,
  display_type VARCHAR(40) NOT NULL DEFAULT 'grid',
  item_limit INT NOT NULL DEFAULT 8,
  show_view_all TINYINT(1) NOT NULL DEFAULT 1,
  destination VARCHAR(500) NULL,
  start_at DATETIME(6) NULL,
  end_at DATETIME(6) NULL,
  settings JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY home_sections_key_uq (section_key),
  KEY home_sections_active_order_idx (is_active, display_order),
  CONSTRAINT home_sections_limit_chk CHECK (item_limit BETWEEN 1 AND 50),
  CONSTRAINT home_sections_dates_chk CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS home_banners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(500) NULL,
  eyebrow VARCHAR(120) NULL,
  image_url VARCHAR(1200) NOT NULL,
  mobile_image_url VARCHAR(1200) NULL,
  video_url VARCHAR(1200) NULL,
  alt_text VARCHAR(255) NOT NULL DEFAULT '',
  button_text VARCHAR(120) NULL,
  destination_type VARCHAR(40) NULL,
  destination_value VARCHAR(500) NULL,
  text_position ENUM('left','center','right') NOT NULL DEFAULT 'left',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  start_at DATETIME(6) NULL,
  end_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY home_banners_active_dates_order_idx (is_active, start_at, end_at, display_order),
  CONSTRAINT home_banners_dates_chk CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS featured_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(120) NOT NULL,
  image_url VARCHAR(1200) NOT NULL,
  alt_text VARCHAR(255) NOT NULL DEFAULT '',
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  start_at DATETIME(6) NULL,
  end_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY featured_categories_active_dates_order_idx (is_active, start_at, end_at, display_order),
  CONSTRAINT featured_categories_dates_chk CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_installs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(40) NOT NULL,
  device VARCHAR(40) NOT NULL,
  browser VARCHAR(40) NOT NULL,
  source VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY app_installs_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  media_url VARCHAR(1200) NOT NULL,
  media_type ENUM('image','video') NOT NULL,
  text VARCHAR(200) NOT NULL,
  advisor_line TINYINT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  likes_count INT UNSIGNED NOT NULL DEFAULT 0,
  whatsapp_clicks INT UNSIGNED NOT NULL DEFAULT 0,
  views_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY community_posts_feed_idx (active, is_pinned, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_likes (
  post_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (post_id, device_id),
  CONSTRAINT community_likes_post_fk FOREIGN KEY (post_id)
    REFERENCES community_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_advisor_lines (
  id TINYINT UNSIGNED NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  display_name VARCHAR(80) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order TINYINT UNSIGNED NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_lines_phone_uq (phone_number),
  UNIQUE KEY whatsapp_lines_order_uq (display_order),
  CONSTRAINT whatsapp_lines_id_chk CHECK (id BETWEEN 1 AND 5),
  CONSTRAINT whatsapp_lines_order_chk CHECK (display_order BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_round_robin_state (
  id TINYINT UNSIGNED NOT NULL,
  next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT whatsapp_state_singleton_chk CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_assignment_settings (
  id TINYINT UNSIGNED NOT NULL,
  max_requests INT UNSIGNED NOT NULL DEFAULT 8,
  window_seconds INT UNSIGNED NOT NULL DEFAULT 300,
  retention_hours INT UNSIGNED NOT NULL DEFAULT 24,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT whatsapp_settings_singleton_chk CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_rate_limits (
  client_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (client_hash),
  KEY whatsapp_rate_limits_window_idx (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_assignment_requests (
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  client_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  advisor_line TINYINT UNSIGNED NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (request_id),
  KEY whatsapp_requests_created_idx (created_at),
  KEY whatsapp_requests_client_idx (client_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO whatsapp_round_robin_state (id, next_sequence)
VALUES (1, 0);

INSERT IGNORE INTO whatsapp_assignment_settings (id, max_requests, window_seconds, retention_hours)
VALUES (1, 8, 300, 24);
