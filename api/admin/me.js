import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "GET")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    return sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email || "",
        role: "admin",
      },
    });
  } catch (error) {
    console.error("[api/admin/me] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible validar la sesión administrativa.",
    });
  }
}
