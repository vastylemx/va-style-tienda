import { requireAdmin } from "../require-admin.js";
import { requireMethod, sendJson } from "../http.js";
import { getSupabaseAdmin } from "../supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, ["GET", "PATCH"])) return;
    const user = await requireAdmin(req, res);
    if (!user) return;
    const supabaseAdmin = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_advisor_lines")
        .select("id,phone_number,is_active,display_order")
        .order("display_order");
      if (error) {
        console.error("[admin/whatsapp-lines] Error cargando líneas:", error);
        return sendJson(res, 503, { ok: false, error: "La migración de líneas de WhatsApp todavía no está disponible." });
      }
      return sendJson(res, 200, { ok: true, lines: data || [] });
    }

    const id = Number(req.body?.id);
    const phoneNumber = String(req.body?.phone_number || "").replace(/\D/g, "");
    if (![1, 2, 3].includes(id) || !/^[0-9]{10,15}$/.test(phoneNumber) || typeof req.body?.is_active !== "boolean") {
      return sendJson(res, 400, { ok: false, error: "La configuración de la línea no es válida." });
    }
    const { data: duplicateLines, error: duplicateError } = await supabaseAdmin
      .from("whatsapp_advisor_lines")
      .select("id")
      .eq("phone_number", phoneNumber)
      .neq("id", id)
      .limit(1);
    if (duplicateError) {
      console.error("[admin/whatsapp-lines] Error validando duplicados:", duplicateError);
      return sendJson(res, 500, { ok: false, error: "No se pudo validar la línea." });
    }
    if (duplicateLines?.length) {
      return sendJson(res, 409, { ok: false, error: "Ese número ya está asignado a otra línea." });
    }
    const { data, error } = await supabaseAdmin
      .from("whatsapp_advisor_lines")
      .update({ phone_number: phoneNumber, is_active: req.body.is_active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,phone_number,is_active,display_order");
    if (error || data?.length !== 1) {
      console.error("[admin/whatsapp-lines] Error guardando línea:", { id, error });
      return sendJson(res, 500, { ok: false, error: "No se pudo guardar la línea." });
    }
    return sendJson(res, 200, { ok: true, line: data[0] });
  } catch (error) {
    console.error("[admin/whatsapp-lines] Error inesperado:", error);
    return sendJson(res, 500, { ok: false, error: "No fue posible administrar las líneas." });
  }
}
