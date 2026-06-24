import { randomUUID } from "node:crypto";
import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const COMMUNITY_MEDIA_BUCKET = "community-media";
const ALLOWED_EXTENSIONS = {
  image: new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]),
  video: new Set(["mp4", "webm", "mov", "m4v", "ogg"]),
};
const MAX_FILE_BYTES = {
  image: 10 * 1024 * 1024,
  video: 15 * 1024 * 1024,
};

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    const mediaType = String(req.body?.mediaType || "").toLowerCase();
    const extension = String(req.body?.extension || "").toLowerCase();
    const contentType = String(req.body?.contentType || "").toLowerCase();
    const fileSize = Number(req.body?.fileSize);
    const allowedExtensions = ALLOWED_EXTENSIONS[mediaType];
    const maxFileBytes = MAX_FILE_BYTES[mediaType];

    if (
      !allowedExtensions?.has(extension) ||
      !contentType.startsWith(`${mediaType}/`) ||
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > maxFileBytes
    ) {
      return sendJson(res, 400, {
        ok: false,
        error:
          mediaType === "video"
            ? "El video comprimido debe pesar 15 MB o menos."
            : "La imagen debe pesar 10 MB o menos.",
      });
    }

    const storagePath = `posts/${randomUUID()}.${extension}`;
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from(COMMUNITY_MEDIA_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error || !data?.token) {
      console.error("[admin/community-upload-url] No fue posible crear la URL firmada:", error);
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo preparar la subida del archivo.",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      storagePath,
      token: data.token,
      contentType,
    });
  } catch (error) {
    console.error("[admin/community-upload-url] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible preparar la publicación.",
    });
  }
}
