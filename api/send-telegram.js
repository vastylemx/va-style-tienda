export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        ok: false,
        error: "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Vercel",
      });
    }

    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "Falta el texto del mensaje" });
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.log("Telegram API error", telegramData);
      return res.status(502).json({ ok: false, error: "Telegram rechazó el mensaje", details: telegramData });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.log("send-telegram error", error);
    return res.status(500).json({ ok: false, error: error.message || "Error enviando Telegram" });
  }
}
