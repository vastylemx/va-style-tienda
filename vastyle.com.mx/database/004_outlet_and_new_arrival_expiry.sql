-- Apply once on the V&A Style MariaDB database, not on the POS database.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_outlet TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_category VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS outlet_price DECIMAL(12,2) NULL,
  ADD COLUMN IF NOT EXISTS last_pieces TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_arrival_started_at DATETIME(6) NULL;

-- Existing flags have no activation history. Give them a full term from migration day.
UPDATE products
SET new_arrival_started_at = UTC_TIMESTAMP(6)
WHERE is_new_arrival = 1 AND new_arrival_started_at IS NULL;
