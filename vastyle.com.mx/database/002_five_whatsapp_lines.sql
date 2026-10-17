-- Expande el roster MariaDB a cinco líneas sin reiniciar el contador global.
ALTER TABLE whatsapp_advisor_lines
  DROP CONSTRAINT IF EXISTS whatsapp_lines_id_chk,
  DROP CONSTRAINT IF EXISTS whatsapp_lines_order_chk;

ALTER TABLE whatsapp_advisor_lines
  ADD CONSTRAINT whatsapp_lines_id_chk CHECK (id BETWEEN 1 AND 5),
  ADD CONSTRAINT whatsapp_lines_order_chk CHECK (display_order BETWEEN 1 AND 5);

ALTER TABLE community_posts
  MODIFY advisor_line TINYINT UNSIGNED NOT NULL DEFAULT 0;

-- El roster es configuración reemplazable; se conservan el historial de
-- asignaciones y whatsapp_round_robin_state.next_sequence.
DELETE FROM whatsapp_advisor_lines;

INSERT INTO whatsapp_advisor_lines (id, phone_number, is_active, display_order) VALUES
  (1, '524821357950', 1, 1),
  (2, '524791438636', 1, 2),
  (3, '524779177633', 1, 3),
  (4, '524774402762', 1, 4),
  (5, '524775910007', 1, 5);
