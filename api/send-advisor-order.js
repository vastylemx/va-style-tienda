import process from "node:process";
import { getSupabaseAdmin } from "./_lib/supabase-admin.js";
import { requireMethod, sendJson } from "./_lib/http.js";

const MAX_ITEMS = 100;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cleanMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function formatMoney(value) {
  return cleanMoney(value).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeMexicanPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `52${digits}`;
  return digits;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return null;

  const normalized = items.map((item) => {
    const quantity = Math.max(1, Math.min(100, Math.floor(Number(item?.quantity) || 1)));
    const unitPrice = cleanMoney(item?.unitPrice);
    const code = String(item?.code || "").trim().slice(0, 100);
    const name = String(item?.name || "").trim().slice(0, 180);
    const color = String(item?.color || "").trim().slice(0, 100);
    const size = String(item?.size || "").trim().slice(0, 50);

    return {
      code,
      name,
      color,
      size,
      quantity,
      unitPrice,
      lineSubtotal: Math.round(unitPrice * quantity * 100) / 100,
    };
  });

  return normalized.every((item) => item.code || item.name) ? normalized : null;
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const error = new Error("Telegram no está configurado.");
    console.error("ERROR ETAPA 5 - Configuración Telegram:", error);
    throw error;
  }

  console.log("ETAPA 5 - Enviando mensaje a Telegram:", {
    chatConfigured: Boolean(chatId),
    textLength: text.length,
  });

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const result = await response.json();
  console.log("ETAPA 5 - Respuesta Telegram:", {
    ok: response.ok,
    status: response.status,
    telegramOk: result?.ok,
    description: result?.description || "",
  });

  if (!response.ok || !result.ok) {
    console.error("ERROR ETAPA 5 - Telegram rechazó el mensaje:", result);
    throw new Error("No se pudo notificar al asesor.");
  }
}

function buildTelegramMessages(headerLines, productLines, footerLines) {
  const maxLength = 3800;
  const messages = [];
  let currentLines = [...headerLines];

  for (const productLine of productLines) {
    const candidate = [...currentLines, "", productLine].join("\n");

    if (candidate.length > maxLength && currentLines.length > headerLines.length) {
      messages.push(currentLines.join("\n"));
      currentLines = [
        "📦 <b>ARTÍCULOS DEL PEDIDO (continuación)</b>",
        "",
        productLine,
      ];
    } else {
      currentLines.push("", productLine);
    }
  }

  const footerCandidate = [...currentLines, "", ...footerLines].join("\n");

  if (footerCandidate.length > maxLength) {
    messages.push(currentLines.join("\n"));
    messages.push(footerLines.join("\n"));
  } else {
    currentLines.push("", ...footerLines);
    messages.push(currentLines.join("\n"));
  }

  return messages;
}

export default async function handler(req, res) {
  try {
    console.log("ETAPA 3 - Inicio /api/send-advisor-order:", {
      method: req.method,
      hasBody: Boolean(req.body),
      customerName: String(req.body?.customerName || "").trim(),
      customerPhone: String(req.body?.customerPhone || "").replace(/\d(?=\d{4})/g, "•"),
      itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0,
    });

    if (!requireMethod(req, res, "POST")) return;

    const customerName = String(req.body?.customerName || "").trim().slice(0, 150);
    const customerPhone = normalizeMexicanPhone(req.body?.customerPhone);
    const items = normalizeItems(req.body?.items);
    const subtotal = cleanMoney(req.body?.subtotal);
    const volumeDiscount = cleanMoney(req.body?.volumeDiscount);
    const shippingCost = cleanMoney(req.body?.shippingCost);
    const needsShippingQuote = req.body?.needsShippingQuote === true;
    const total = cleanMoney(req.body?.total);

    if (!customerName || !customerPhone) {
      console.error("ERROR ETAPA 3 - Validación cliente:", {
        hasCustomerName: Boolean(customerName),
        hasCustomerPhone: Boolean(customerPhone),
      });
      return sendJson(res, 400, {
        ok: false,
        error: "Nombre y teléfono son obligatorios.",
      });
    }

    if (!items) {
      console.error("ERROR ETAPA 3 - Validación productos:", {
        receivedItems: req.body?.items,
      });
      return sendJson(res, 400, {
        ok: false,
        error: "El pedido no contiene productos válidos.",
      });
    }

    const totalPieces = items.reduce((sum, item) => sum + item.quantity, 0);
    const calculatedSubtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const safeSubtotal = calculatedSubtotal > 0 ? calculatedSubtotal : subtotal;
    const safeTotal = needsShippingQuote
      ? Math.max(safeSubtotal - volumeDiscount, 0)
      : Math.max(safeSubtotal - volumeDiscount + shippingCost, 0);
    const createdAt = new Date();
    const supabaseAdmin = getSupabaseAdmin();

    console.log("ETAPA 4 - Insertando pedido en Supabase:", {
      customerName,
      customerPhone: customerPhone.replace(/\d(?=\d{4})/g, "•"),
      totalPieces,
      safeSubtotal,
      safeTotal: safeTotal || total,
    });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: customerName,
        customer_phone: customerPhone,
        subtotal: safeSubtotal,
        shipping_units: totalPieces,
        shipping_cost: needsShippingQuote ? 0 : shippingCost,
        service_fee: 0,
        volume_discount: volumeDiscount,
        total: safeTotal || total,
        payment_method: "asesor",
        payment_status: "pending",
        order_status: "pending",
      })
      .select("id,created_at")
      .single();

    console.log("ETAPA 4 - Resultado INSERT Supabase:", {
      orderId: order?.id || null,
      createdAt: order?.created_at || null,
      error: orderError,
    });

    if (orderError || !order) {
      console.error("ERROR ETAPA 4 - INSERT Supabase:", orderError || new Error("INSERT sin fila"));
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo registrar el pedido.",
      });
    }

    const productLines = items.map((item, index) => {
      const details = [
        item.code ? `Código: ${escapeHtml(item.code)}` : "",
        item.name ? `Producto: ${escapeHtml(item.name)}` : "",
        item.color ? `Color/variante: ${escapeHtml(item.color)}` : "",
        item.size ? `Talla: ${escapeHtml(item.size)}` : "",
        `Cantidad: ${item.quantity}`,
        `Precio unitario: $${formatMoney(item.unitPrice)} MXN`,
        `Subtotal: $${formatMoney(item.lineSubtotal)} MXN`,
      ].filter(Boolean);

      return `<b>${index + 1}.</b> ${details.join("\n   ")}`;
    });

    const whatsappUrl = `https://wa.me/${customerPhone}`;
    const headerLines = [
      "🛍️ <b>NUEVO PEDIDO PARA ASESOR - V&amp;A STYLE</b>",
      "",
      `🧾 Pedido: <code>${escapeHtml(order.id)}</code>`,
      `👤 Cliente: ${escapeHtml(customerName)}`,
      `📞 Teléfono: ${escapeHtml(customerPhone)}`,
      `💬 WhatsApp: <a href="${whatsappUrl}">${whatsappUrl}</a>`,
      "",
      "📦 <b>ARTÍCULOS</b>",
    ];
    const footerLines = [
      `🔢 Total de piezas: <b>${totalPieces}</b>`,
      `💵 Subtotal: $${formatMoney(safeSubtotal)} MXN`,
      volumeDiscount > 0
        ? `🏷️ Descuento: -$${formatMoney(volumeDiscount)} MXN`
        : "",
      needsShippingQuote
        ? "🚚 Envío: Por cotizar con el asesor"
        : `🚚 Envío: $${formatMoney(shippingCost)} MXN`,
      `💰 Total estimado: <b>$${formatMoney(safeTotal || total)} MXN</b>`,
      `🕒 Fecha y hora: ${createdAt.toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
    ].filter(Boolean);
    const telegramMessages = buildTelegramMessages(headerLines, productLines, footerLines);

    try {
      for (const telegramMessage of telegramMessages) {
        await sendTelegramMessage(telegramMessage);
      }
    } catch (telegramError) {
      console.error("ERROR ETAPA 5 - Pedido guardado, Telegram falló:", telegramError);

      const { error: rollbackError } = await supabaseAdmin
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (rollbackError) {
        console.error("ERROR ETAPA 5 - Rollback del pedido:", rollbackError);
      }

      return sendJson(res, 502, {
        ok: false,
        error: "No se pudo notificar al asesor. Intenta nuevamente.",
      });
    }

    return sendJson(res, 201, {
      ok: true,
      orderId: order.id,
    });
  } catch (error) {
    console.error("ERROR ETAPA 3 - Endpoint inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: error?.message || "No fue posible enviar el pedido.",
    });
  }
}
