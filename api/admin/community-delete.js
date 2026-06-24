import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const COMMUNITY_MEDIA_BUCKET = "community-media";

function getCommunityStoragePath(mediaUrl) {
  const marker = `/object/public/${COMMUNITY_MEDIA_BUCKET}/`;
  const markerIndex = String(mediaUrl || "").indexOf(marker);
  if (markerIndex === -1) return "";

  const storagePath = decodeURIComponent(
    String(mediaUrl).slice(markerIndex + marker.length).split("?")[0]
  );

  const safePath =
    /^posts\/[a-z0-9][a-z0-9._-]{0,180}$/i.test(storagePath) &&
    !storagePath.includes("..");

  return safePath ? storagePath : "";
}

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    const postId = String(req.body?.postId || "").trim();

    if (!postId) {
      return sendJson(res, 400, {
        ok: false,
        error: "Falta postId.",
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: post, error: readError } = await supabaseAdmin
      .from("community_posts")
      .select("id,media_url")
      .eq("id", postId)
      .maybeSingle();

    if (readError) {
      console.error("[admin/community-delete] Error leyendo community_posts:", readError);
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo consultar la publicación.",
      });
    }

    if (!post) {
      return sendJson(res, 404, {
        ok: false,
        error: "La publicación no existe.",
      });
    }

    const { data: deletedPosts, error: deleteError } = await supabaseAdmin
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .select("id");

    const deletedCount = Array.isArray(deletedPosts) ? deletedPosts.length : 0;

    if (deleteError || deletedCount !== 1) {
      console.error("[admin/community-delete] DELETE no confirmado:", {
        postId,
        deletedPosts,
        deleteError,
      });

      return sendJson(res, 500, {
        ok: false,
        error: deleteError?.message || "Supabase no confirmó la eliminación.",
      });
    }

    const { data: postAfterDelete, error: verificationError } = await supabaseAdmin
      .from("community_posts")
      .select("id")
      .eq("id", postId)
      .maybeSingle();

    if (verificationError || postAfterDelete) {
      console.error("[admin/community-delete] La fila continúa después del DELETE:", {
        postId,
        postAfterDelete,
        verificationError,
      });

      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo confirmar la eliminación de la publicación.",
      });
    }

    const storagePath = getCommunityStoragePath(post.media_url);
    let storageDeleted = false;
    let storageWarning = "";

    if (storagePath) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(COMMUNITY_MEDIA_BUCKET)
        .remove([storagePath]);

      if (storageError) {
        console.error("[admin/community-delete] La fila se eliminó, pero Storage falló:", storageError);
        storageWarning = "La publicación fue eliminada, pero no se pudo limpiar su archivo.";
      } else {
        storageDeleted = true;
      }
    }

    return sendJson(res, 200, {
      ok: true,
      deletedPosts,
      deletedCount,
      confirmedDeleted: true,
      storagePath,
      storageDeleted,
      storageWarning,
    });
  } catch (error) {
    console.error("[admin/community-delete] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible eliminar la publicación.",
    });
  }
}
