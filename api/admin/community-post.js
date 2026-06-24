import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const COMMUNITY_MEDIA_BUCKET = "community-media";
const MAX_POST_TEXT_LENGTH = 200;
const POST_FIELDS =
  "id, media_url, media_type, text, advisor_line, active, is_pinned, likes_count, whatsapp_clicks, created_at";
const MEDIA_EXTENSIONS = {
  image: new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]),
  video: new Set(["mp4", "webm", "mov", "m4v", "ogg"]),
};
const MAX_FILE_BYTES = {
  image: 10 * 1024 * 1024,
  video: 15 * 1024 * 1024,
};

function isValidCommunityPath(value) {
  return /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,10}$/i.test(
    String(value || "")
  );
}

function getStorageFileName(storagePath) {
  return storagePath.replace(/^posts\//, "");
}

function getStorageExtension(storagePath) {
  return storagePath.split(".").pop()?.toLowerCase() || "";
}

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    const storagePath = String(req.body?.storagePath || "");
    const mediaType = String(req.body?.mediaType || "").toLowerCase();
    const text = String(req.body?.text || "").trim();
    const advisorLine = String(req.body?.advisorLine || "1");

    if (!isValidCommunityPath(storagePath)) {
      return sendJson(res, 400, { ok: false, error: "La ruta del archivo no es válida." });
    }

    if (!["image", "video"].includes(mediaType)) {
      return sendJson(res, 400, { ok: false, error: "El tipo de publicación no es válido." });
    }

    if (!MEDIA_EXTENSIONS[mediaType]?.has(getStorageExtension(storagePath))) {
      return sendJson(res, 400, {
        ok: false,
        error: "La extensión no coincide con el tipo de publicación.",
      });
    }

    if (!text || text.length > MAX_POST_TEXT_LENGTH) {
      return sendJson(res, 400, {
        ok: false,
        error: `El texto debe contener entre 1 y ${MAX_POST_TEXT_LENGTH} caracteres.`,
      });
    }

    if (!["1", "2", "3"].includes(advisorLine)) {
      return sendJson(res, 400, { ok: false, error: "La línea de asesor no es válida." });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const storageFileName = getStorageFileName(storagePath);
    const { data: storedFiles, error: storageError } = await supabaseAdmin.storage
      .from(COMMUNITY_MEDIA_BUCKET)
      .list("posts", {
        limit: 2,
        search: storageFileName,
      });
    const storedFile = storedFiles?.find((file) => file.name === storageFileName);
    const storedContentType = String(storedFile?.metadata?.mimetype || "").toLowerCase();
    const storedFileSize = Number(storedFile?.metadata?.size || 0);

    if (storageError || !storedFile) {
      console.error("[admin/community-post] Archivo no encontrado en community-media:", storageError);
      return sendJson(res, 400, {
        ok: false,
        error: "El archivo de la publicación no existe en community-media.",
      });
    }

    if (storedContentType && !storedContentType.startsWith(`${mediaType}/`)) {
      await supabaseAdmin.storage.from(COMMUNITY_MEDIA_BUCKET).remove([storagePath]);
      return sendJson(res, 400, {
        ok: false,
        error: "El archivo subido no coincide con el tipo de publicación.",
      });
    }

    if (
      !Number.isFinite(storedFileSize) ||
      storedFileSize <= 0 ||
      storedFileSize > MAX_FILE_BYTES[mediaType]
    ) {
      await supabaseAdmin.storage.from(COMMUNITY_MEDIA_BUCKET).remove([storagePath]);
      return sendJson(res, 400, {
        ok: false,
        error:
          mediaType === "video"
            ? "El video comprimido supera el máximo de 15 MB."
            : "La imagen supera el máximo de 10 MB.",
      });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(COMMUNITY_MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    const { data: createdPost, error: insertError } = await supabaseAdmin
      .from("community_posts")
      .insert({
        media_url: publicUrlData.publicUrl,
        media_type: mediaType,
        text,
        advisor_line: advisorLine,
        active: true,
        is_pinned: false,
        likes_count: 0,
        whatsapp_clicks: 0,
        views_count: 0,
        created_at: new Date().toISOString(),
      })
      .select(POST_FIELDS)
      .single();

    if (insertError || !createdPost) {
      console.error("[admin/community-post] Error insertando community_posts:", insertError);
      await supabaseAdmin.storage.from(COMMUNITY_MEDIA_BUCKET).remove([storagePath]);

      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo guardar la publicación.",
      });
    }

    return sendJson(res, 201, {
      ok: true,
      post: createdPost,
    });
  } catch (error) {
    console.error("[admin/community-post] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible crear la publicación.",
    });
  }
}
