import { createHmac } from "node:crypto";
import process from "node:process";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : value || "").split(",")[0].trim();
}

function getClientAddress(req) {
  return (
    firstHeaderValue(req.headers["x-vercel-forwarded-for"]) ||
    firstHeaderValue(req.headers["x-forwarded-for"]) ||
    firstHeaderValue(req.headers["x-real-ip"]) ||
    String(req.socket?.remoteAddress || "").trim() ||
    "unknown"
  ).toLowerCase();
}

function hashClientAddress(address) {
  const secret =
    process.env.WHATSAPP_RATE_LIMIT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Falta WHATSAPP_RATE_LIMIT_SALT en el entorno del servidor.");
  return createHmac("sha256", secret).update(address).digest("hex");
}

function hasExpectedOrigin(req) {
  const origin = firstHeaderValue(req.headers.origin);
  const referer = firstHeaderValue(req.headers.referer);
  const candidate = origin || referer;
  if (!candidate) return true;

  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    const configuredHosts = [
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
    ].filter(Boolean).map((value) => String(value).replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".vercel.app") ||
      configuredHosts.includes(hostname)
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;

    const requestId = String(req.body?.requestId || "").trim();
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      return sendJson(res, 400, { ok: false, error: "requestId no es válido." });
    }

    const previousAdvisorLine = Number(req.body?.advisorLine);
    if (!hasExpectedOrigin(req)) {
      // Señal de defensa en profundidad. No bloquea PWA ni clientes sin Origin;
      // el límite persistente continúa siendo la protección principal.
      console.warn("[whatsapp/assign] Solicitud con origen no reconocido.");
    }

    const clientHash = hashClientAddress(getClientAddress(req));
    const supabaseAdmin = getSupabaseAdmin();

    if ([1, 2, 3].includes(previousAdvisorLine)) {
      const { data: previousAdvisor, error: previousAdvisorError } = await supabaseAdmin
        .from("whatsapp_advisor_lines")
        .select("id,phone_number,is_active")
        .eq("id", previousAdvisorLine)
        .maybeSingle();

      if (previousAdvisorError) {
        console.error("[whatsapp/assign] No se pudo validar la asignación guardada:", {
          advisorLine: previousAdvisorLine,
          error: previousAdvisorError,
        });
      } else if (previousAdvisor?.is_active && previousAdvisor.phone_number) {
        return sendJson(res, 200, {
          ok: true,
          advisorLine: Number(previousAdvisor.id),
          phoneNumber: previousAdvisor.phone_number,
          preservedAssignment: true,
          duplicateRequest: false,
        });
      }
    }

    const { data, error } = await supabaseAdmin.rpc("assign_whatsapp_advisor", {
      p_request_id: requestId,
      p_client_hash: clientHash,
    });
    const assignment = data?.[0];

    if (error) {
      console.error("[whatsapp/assign] No se pudo asignar línea:", error);
      return sendJson(res, 503, { ok: false, error: "No fue posible asignar una línea." });
    }

    if (assignment?.rate_limited) {
      const retryAfter = Math.max(1, Number(assignment.retry_after_seconds) || 60);
      res.setHeader("Retry-After", String(retryAfter));
      return sendJson(res, 429, {
        ok: false,
        rateLimited: true,
        retryAfter,
        error: "Demasiados intentos. Se utilizará la línea principal.",
      });
    }

    if (!assignment?.phone_number) {
      return sendJson(res, 503, { ok: false, error: "No hay líneas disponibles." });
    }

    return sendJson(res, 200, {
      ok: true,
      advisorLine: Number(assignment.advisor_line),
      phoneNumber: assignment.phone_number,
      duplicateRequest: Boolean(assignment.duplicate_request),
    });
  } catch (error) {
    console.error("[whatsapp/assign] Error inesperado:", error);
    return sendJson(res, 503, { ok: false, error: "No fue posible asignar una línea." });
  }
}
