# MariaDB

Contendra el esquema y las migraciones MariaDB revisadas. Los archivos SQL no incluiran datos personales ni credenciales.

## Promoción Halloween 2026

La migración `006_halloween_first_order_promotion.sql` añade únicamente campos promocionales/idempotentes a `orders` y crea las tablas de configuración, redenciones y límite de consultas. No actualiza ni elimina filas anteriores. La campaña se crea inactiva (`is_active = 0`) para evitar aplicar el descuento a clientes mientras el frontend nuevo aún no esté publicado. Tras publicar y comprobar frontend y API, actívala en `seasonal_promotions` (`promotion_key = 'halloween-2026'`). Los textos editables están en `texts_json`. Las fechas se guardan en UTC. Para pausar, establece `is_active = 0`; para reactivar, cambia esa bandera y actualiza inicio/fin sin borrar `seasonal_promotion_redemptions`.

La API de pedidos valida cada redención dentro de la transacción de registro y la vincula al teléfono normalizado del cliente y al pedido. Reintentar la misma solicitud reutiliza `order_idempotency_key` y la clasificación/mensaje ya guardados. Las filas antiguas quedan con `promo_applied = 0` y no se reclasifican.
