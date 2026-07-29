import { sendJson } from "../_lib/http.js";
import homeConfig from "../_lib/admin-handlers/home-config.js";
import homeUploadUrl from "../_lib/admin-handlers/home-upload-url.js";
import productDelete from "../_lib/admin-handlers/product-delete.js";
import review from "../_lib/admin-handlers/review.js";
import whatsappLines from "../_lib/admin-handlers/whatsapp-lines.js";

const HANDLERS = Object.freeze({
  "home-config": homeConfig,
  "home-upload-url": homeUploadUrl,
  "product-delete": productDelete,
  review,
  "whatsapp-lines": whatsappLines,
});

export default async function handler(req, res) {
  const resourceValue = Array.isArray(req.query?.resource)
    ? req.query.resource[0]
    : req.query?.resource;
  const resource = String(resourceValue || "").trim().toLowerCase();
  const resourceHandler = HANDLERS[resource];

  if (!resourceHandler) {
    return sendJson(res, 404, {
      ok: false,
      error: "La operación administrativa solicitada no está disponible.",
    });
  }

  return resourceHandler(req, res);
}
