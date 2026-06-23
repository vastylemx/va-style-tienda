import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    const { postId, isPinned } = req.body || {};

    if (!postId || typeof isPinned !== "boolean") {
      return sendJson(res, 400, {
        ok: false,
        error: "Faltan postId o isPinned.",
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (isPinned) {
      const { error: unpinError } = await supabaseAdmin
        .from("community_posts")
        .update({ is_pinned: false })
        .eq("is_pinned", true)
        .neq("id", postId);

      if (unpinError) {
        console.error("[admin/community-pin] No fue posible quitar el fijado anterior:", unpinError);
        return sendJson(res, 500, {
          ok: false,
          error: "No se pudo preparar la publicación fijada.",
        });
      }
    }

    const updatePayload = isPinned
      ? { is_pinned: true, active: true }
      : { is_pinned: false };

    const { data: updatedPost, error: updateError } = await supabaseAdmin
      .from("community_posts")
      .update(updatePayload)
      .eq("id", postId)
      .select("id,is_pinned,active")
      .maybeSingle();

    if (updateError) {
      console.error("[admin/community-pin] Error actualizando community_posts:", updateError);
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo actualizar la publicación.",
      });
    }

    if (!updatedPost) {
      return sendJson(res, 404, {
        ok: false,
        error: "La publicación no existe o no pudo actualizarse.",
      });
    }

    if (Boolean(updatedPost.is_pinned) !== isPinned) {
      console.error("[admin/community-pin] El valor fue revertido después del UPDATE:", {
        postId,
        requestedIsPinned: isPinned,
        updatedPost,
      });

      return sendJson(res, 409, {
        ok: false,
        error: "La base de datos revirtió el estado fijado. Revisa el trigger de publicaciones fijadas.",
      });
    }

    const { data: pinnedPosts, error: verificationError } = await supabaseAdmin
      .from("community_posts")
      .select("id,is_pinned,active")
      .eq("is_pinned", true);

    if (verificationError) {
      console.error("[admin/community-pin] No fue posible verificar publicaciones fijadas:", verificationError);
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo verificar la publicación fijada.",
      });
    }

    const validPinnedState = isPinned
      ? pinnedPosts.length === 1 &&
        pinnedPosts[0].id === postId &&
        pinnedPosts[0].active === true
      : pinnedPosts.length <= 1;

    if (!validPinnedState) {
      console.error("[admin/community-pin] Estado final inválido:", {
        postId,
        requestedIsPinned: isPinned,
        pinnedPosts,
      });

      return sendJson(res, 409, {
        ok: false,
        error: "La base de datos no dejó un estado válido de publicación fijada.",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      post: updatedPost,
      pinnedCount: pinnedPosts.length,
    });
  } catch (error) {
    console.error("[admin/community-pin] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible cambiar la publicación fijada.",
    });
  }
}
