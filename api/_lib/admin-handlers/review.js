import { requireAdmin } from "../require-admin.js";
import { requireMethod, sendJson } from "../http.js";
import { getSupabaseAdmin } from "../supabase-admin.js";

function isValidId(value) {
  return /^[a-z0-9_-]{1,128}$/i.test(String(value ?? "").trim());
}

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, ["PATCH", "DELETE"])) return;
    const user = await requireAdmin(req, res);
    if (!user) return;

    const reviewId = String(req.body?.reviewId ?? "").trim();
    if (!isValidId(reviewId)) {
      return sendJson(res, 400, { ok: false, error: "El ID de la reseña no es válido." });
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (req.method === "PATCH") {
      if (req.body?.approved !== true && req.body?.approved !== false) {
        return sendJson(res, 400, { ok: false, error: "El estado de aprobación no es válido." });
      }

      const { data, error } = await supabaseAdmin
        .from("reviews")
        .update({ approved: req.body.approved })
        .eq("id", reviewId)
        .select("*");

      if (error) {
        console.error("[admin/review] Error actualizando reseña:", { reviewId, error });
        return sendJson(res, 500, { ok: false, error: "No se pudo actualizar la reseña." });
      }
      if (data?.length !== 1 || String(data[0].id) !== reviewId) {
        return sendJson(res, 404, { ok: false, error: "La reseña no existe o no fue actualizada." });
      }

      return sendJson(res, 200, { ok: true, review: data[0] });
    }

    const { data, error } = await supabaseAdmin
      .from("reviews")
      .delete()
      .eq("id", reviewId)
      .select("id");

    if (error) {
      console.error("[admin/review] Error eliminando reseña:", { reviewId, error });
      return sendJson(res, error.code === "23503" ? 409 : 500, {
        ok: false,
        error: error.code === "23503"
          ? "La reseña tiene información relacionada y no puede eliminarse."
          : "No se pudo eliminar la reseña.",
      });
    }
    if (data?.length !== 1 || String(data[0].id) !== reviewId) {
      return sendJson(res, 404, { ok: false, error: "La reseña no existe." });
    }

    return sendJson(res, 200, { ok: true, deletedReviewId: data[0].id });
  } catch (error) {
    console.error("[admin/review] Error inesperado:", error);
    return sendJson(res, 500, { ok: false, error: "No fue posible administrar la reseña." });
  }
}
