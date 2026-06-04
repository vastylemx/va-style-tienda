export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { orderId, items, total } = req.body;

    if (!orderId || !items?.length || !total) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const preference = {
      items: [
        {
          title: `Pedido V&A Style #${orderId}`,
          quantity: 1,
          unit_price: Number(total),
          currency_id: "MXN",
        },
      ],
      external_reference: orderId,
      back_urls: {
        success: "https://va-style-tienda.vercel.app/?payment=success",
        failure: "https://va-style-tienda.vercel.app/?payment=failure",
        pending: "https://va-style-tienda.vercel.app/?payment=pending",
      },
      auto_return: "approved",
      metadata: {
        order_id: orderId,
      },
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preference),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mercado Pago error:", data);
      return res.status(500).json({ error: "Error creando preferencia", details: data });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}