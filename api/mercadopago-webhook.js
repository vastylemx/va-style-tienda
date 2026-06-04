import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const paymentId = req.query?.["data.id"] || req.body?.data?.id || req.body?.id;

    if (!paymentId) {
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

    await supabase
      .from("orders")
      .update({
        payment_status: newStatus,
        mercado_pago_payment_id: String(payment.id || paymentId),
      })
      .eq("id", orderId);

    return res.status(200).json({
      received: true,
      orderId,
      paymentId,
      status: newStatus,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).json({ received: true });
  }
}