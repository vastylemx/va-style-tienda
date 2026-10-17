ALTER TABLE whatsapp_advisor_lines
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(80) NOT NULL DEFAULT '' AFTER phone_number;

UPDATE whatsapp_advisor_lines
SET display_name = CASE id
  WHEN 1 THEN 'NOEMI GOMEZ'
  WHEN 2 THEN 'VENDEDOR'
  WHEN 3 THEN 'ALEJANDRO VEGA'
  WHEN 4 THEN 'LUIS AVILA'
  WHEN 5 THEN 'VENDEDOR'
  ELSE display_name
END
WHERE display_name = '' AND id BETWEEN 1 AND 5;
