import { getSupabaseAdmin } from "./supabase-admin.js";
import { sendJson } from "./http.js";

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireAdmin(req, res) {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    sendJson(res, 401, { ok: false, error: "Sesión administrativa requerida." });
    return null;
  }

  let supabaseAdmin;

  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error("[admin-auth] Configuración inválida:", error);
    sendJson(res, 500, { ok: false, error: "La autenticación administrativa no está configurada." });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  const user = data?.user;

  if (error || !user) {
    if (error) console.error("[admin-auth] Token rechazado por Supabase:", error.message);
    sendJson(res, 401, { ok: false, error: "La sesión administrativa expiró o no es válida." });
    return null;
  }

  if (user.app_metadata?.role !== "admin") {
    sendJson(res, 403, { ok: false, error: "Esta cuenta no tiene permisos de administrador." });
    return null;
  }

  return user;
}
