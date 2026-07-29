import { randomUUID } from "node:crypto";
import { requireAdmin } from "../require-admin.js";
import { requireMethod, sendJson } from "../http.js";
import { getSupabaseAdmin } from "../supabase-admin.js";

const BUCKET = "home-media";
const EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "POST")) return;
    const user = await requireAdmin(req, res);
    if (!user) return;

    const extension = String(req.body?.extension || "").toLowerCase();
    const contentType = String(req.body?.contentType || "").toLowerCase();
    const fileSize = Number(req.body?.fileSize);
    if (
      !EXTENSIONS.has(extension) ||
      !contentType.startsWith("image/") ||
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_BYTES
    ) {
      return sendJson(res, 400, {
        ok: false,
        error: "La imagen debe ser JPG, PNG o WebP y pesar 10 MB o menos.",
      });
    }

    const storagePath = `editorial/${randomUUID()}.${extension}`;
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error || !data?.token) {
      console.error("[admin/home-upload-url] Error creando subida firmada:", error);
      return sendJson(res, 500, { ok: false, error: "No se pudo preparar la subida." });
    }

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    return sendJson(res, 200, {
      ok: true,
      storagePath,
      token: data.token,
      publicUrl: publicData.publicUrl,
    });
  } catch (error) {
    console.error("[admin/home-upload-url] Error inesperado:", error);
    return sendJson(res, 500, { ok: false, error: "No fue posible preparar la imagen." });
  }
}
