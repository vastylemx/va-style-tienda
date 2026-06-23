import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COMMUNITY_MEDIA_BUCKET = "community-media";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://ankhvpcykeyexwnwcmqa.supabase.co";

function safeCompare(value, expected) {
  const valueBuffer = Buffer.from(String(value || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));

  if (!valueBuffer.length || valueBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function getCommunityStoragePath(mediaUrl) {
  const marker = `/object/public/${COMMUNITY_MEDIA_BUCKET}/`;
  const markerIndex = String(mediaUrl || "").indexOf(marker);
  if (markerIndex === -1) return "";

  return decodeURIComponent(String(mediaUrl).slice(markerIndex + marker.length).split("?")[0]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminSecret = process.env.COMMUNITY_ADMIN_PASSWORD || process.env.COMMUNITY_ADMIN_TOKEN;

    if (!serviceRoleKey) {
      return res.status(500).json({
        ok: false,
        error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.",
      });
    }

    if (!adminSecret) {
      return res.status(500).json({
        ok: false,
        error: "Falta COMMUNITY_ADMIN_PASSWORD o COMMUNITY_ADMIN_TOKEN en Vercel.",
      });
    }

    const { postId, adminPassword } = req.body || {};
    const headerPassword = req.headers["x-community-admin-password"];
    const providedSecret = adminPassword || headerPassword;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (!postId) {
      return res.status(400).json({ ok: false, error: "Falta postId." });
    }

    if (!safeCompare(providedSecret, adminSecret)) {
      console.warn("[community-delete-post] Intento no autorizado:", { postId });
      return res.status(401).json({ ok: false, error: "No autorizado." });
    }

    console.log("[community-delete-post] postId recibido:", { postId });
    console.log("[community-delete-post] Configuración Supabase:", {
      supabaseUrl: SUPABASE_URL,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      serviceRoleKeyPrefix: serviceRoleKey.slice(0, 8),
    });

    const { data: post, error: readError } = await supabaseAdmin
      .from("community_posts")
      .select("id, media_url")
      .eq("id", postId)
      .single();

    console.log("[community-delete-post] Publicación encontrada antes de borrar:", {
      postId,
      post,
      readError,
    });

    if (readError || !post) {
      console.error("[community-delete-post] Error leyendo publicación:", readError);
      return res.status(404).json({
        ok: false,
        error: "Publicación no encontrada.",
        details: readError,
      });
    }

    const { data: deletedPosts, error: deleteError } = await supabaseAdmin
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .select("id");

    const deletedCount = Array.isArray(deletedPosts) ? deletedPosts.length : 0;

    console.log("[community-delete-post] Resultado DELETE community_posts:", {
      postId,
      deletedPosts,
      deletedCount,
      error: deleteError,
    });

    if (deleteError || deletedCount === 0) {
      console.error("[community-delete-post] DELETE falló o no eliminó filas:", {
        postId,
        deletedCount,
        deleteError,
      });

      return res.status(500).json({
        ok: false,
        error: deleteError?.message || "Supabase no eliminó ninguna fila.",
        details: deleteError,
        deletedPosts: deletedPosts || [],
      });
    }

    const { data: postAfterDelete, error: verifyError } = await supabaseAdmin
      .from("community_posts")
      .select("id")
      .eq("id", postId)
      .maybeSingle();

    const confirmedDeleted = !verifyError && !postAfterDelete;

    console.log("[community-delete-post] Verificación después del DELETE:", {
      postId,
      postAfterDelete,
      confirmedDeleted,
      verifyError,
    });

    if (!confirmedDeleted) {
      return res.status(500).json({
        ok: false,
        error: verifyError?.message || "La publicación sigue existiendo después del DELETE.",
        details: verifyError,
        deletedPosts,
        deletedCount,
        confirmedDeleted,
        postAfterDelete,
      });
    }

    const storagePath = getCommunityStoragePath(post.media_url);
    let storageDeleted = false;
    let storageError = null;

    if (storagePath) {
      const { error } = await supabaseAdmin.storage
        .from(COMMUNITY_MEDIA_BUCKET)
        .remove([storagePath]);

      storageError = error;
      storageDeleted = !error;

      console.log("[community-delete-post] Resultado DELETE storage community-media:", {
        postId,
        storagePath,
        error,
      });
    }

    return res.status(200).json({
      ok: true,
      deletedPosts,
      deletedCount,
      confirmedDeleted,
      storagePath,
      storageDeleted,
      storageError,
    });
  } catch (error) {
    console.error("[community-delete-post] Error interno:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Error interno eliminando publicación.",
    });
  }
}
