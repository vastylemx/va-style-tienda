import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram no configurado");
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Error enviando Telegram:", data);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const paymentId = req.query?.["data.id"] || req.body?.data?.id || req.body?.id;

    if (!paymentId) {
      console.log("Webhook recibido sin paymentId:", req.body);
      return res.status(200).json({ received: true, message: "Sin paymentId" });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const payment = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Error consultando pago:", payment);
      return res.status(200).json({ received: true });
    }

    const orderId = payment.external_reference || payment.metadata?.order_id;

    if (!orderId) {
      console.log("Pago sin orderId:", payment);
      return res.status(200).json({ received: true, message: "Sin orderId" });
    }

    const newStatus =
      payment.status === "approved"
        ? "paid"
        : payment.status === "rejected"
        ? "rejected"
        : payment.status === "cancelled"
        ? "cancelled"
        : payment.status || "pending";

    const { data: previousOrder } = await supabase
      .from("orders")
      .select("id, customer_name, customer_phone, total, payment_status")
      .eq("id", orderId)
      .single();

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: newStatus,
        status: newStatus,
        order_status: newStatus,
        mercado_pago_payment_id: String(payment.id || paymentId),
      })
      .eq("id", orderId)
      .select("id, customer_name, customer_phone, total, payment_status, status, order_status")
      .single();

    if (updateError) {
      console.error("Error actualizando pedido:", updateError);
      return res.status(200).json({
        received: true,
        error: updateError.message,
        orderId,
        paymentId,
        status: newStatus,
      });
    }

    if (
      newStatus === "paid" &&
      previousOrder?.payment_status !== "paid"
    ) {
      const message = `
🛍️ <b>NUEVA VENTA PAGADA - V&A STYLE</b>

👤 Cliente: ${updatedOrder.customer_name || "Sin nombre"}
📞 Teléfono: ${updatedOrder.customer_phone || "Sin teléfono"}
💰 Total: $${Number(updatedOrder.total || payment.transaction_amount || 0).toLocaleString("es-MX")} MXN

✅ Pago confirmado por Mercado Pago
🧾 Pedido: ${updatedOrder.id}
`;

      await sendTelegramMessage(message);
    }

    console.log("Pedido actualizado correctamente:", updatedOrder);

    return res.status(200).json({
      received: true,
      orderId,
      paymentId,
      status: newStatus,
      updatedOrder,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).json({ received: true, error: error.message });
  }
}