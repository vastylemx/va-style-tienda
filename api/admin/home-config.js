import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const TABLES = {
  section: "home_sections",
  banner: "home_banners",
  category: "featured_categories",
};
const HOME_MEDIA_BUCKET = "home-media";

function cleanText(value, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function optionalDate(value) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function getEditorialStoragePath(mediaUrl) {
  const marker = `/object/public/${HOME_MEDIA_BUCKET}/`;
  const value = String(mediaUrl || "");
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1) return "";
  const storagePath = decodeURIComponent(value.slice(markerIndex + marker.length).split("?")[0]);
  return /^editorial\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(storagePath) ? storagePath : "";
}

async function removeUnusedEditorialMedia(supabaseAdmin, urls) {
  const candidates = [...new Set(urls.filter(Boolean))];
  if (!candidates.length) return [];

  const [banners, categories, legacy] = await Promise.all([
    supabaseAdmin.from("home_banners").select("image_url,mobile_image_url"),
    supabaseAdmin.from("featured_categories").select("image_url"),
    supabaseAdmin.from("home_settings").select("hero_image_url,new_arrivals_image_url,best_sellers_image_url"),
  ]);
  if (banners.error || categories.error || legacy.error) {
    console.error("[admin/home-config] No fue posible verificar imágenes en uso:", {
      banners: banners.error,
      categories: categories.error,
      legacy: legacy.error,
    });
    return [];
  }

  const usedUrls = new Set([
    ...(banners.data || []).flatMap((item) => [item.image_url, item.mobile_image_url]),
    ...(categories.data || []).map((item) => item.image_url),
    ...(legacy.data || []).flatMap((item) => [
      item.hero_image_url,
      item.new_arrivals_image_url,
      item.best_sellers_image_url,
    ]),
  ].filter(Boolean));
  const removablePaths = candidates
    .filter((url) => !usedUrls.has(url))
    .map(getEditorialStoragePath)
    .filter(Boolean);

  if (!removablePaths.length) return [];
  const { error } = await supabaseAdmin.storage.from(HOME_MEDIA_BUCKET).remove(removablePaths);
  if (error) {
    console.error("[admin/home-config] La configuración se guardó, pero no se limpiaron imágenes:", error);
    return [];
  }
  return removablePaths;
}

function sectionPayload(body) {
  return {
    title: cleanText(body.title, 120),
    subtitle: cleanText(body.subtitle, 240) || null,
    is_active: Boolean(body.is_active),
    visibility_mode: ["active", "inactive", "automatic"].includes(body.visibility_mode)
      ? body.visibility_mode
      : "automatic",
    display_order: Number.isInteger(Number(body.display_order)) ? Number(body.display_order) : 0,
    display_type: cleanText(body.display_type, 40) || "grid",
    item_limit: Math.min(50, Math.max(1, Number(body.item_limit) || 8)),
    show_view_all: Boolean(body.show_view_all),
    destination: cleanText(body.destination, 200) || null,
    start_at: optionalDate(body.start_at),
    end_at: optionalDate(body.end_at),
    settings: body.settings && typeof body.settings === "object" ? body.settings : {},
    updated_at: new Date().toISOString(),
  };
}

function bannerPayload(body) {
  return {
    title: cleanText(body.title, 120),
    subtitle: cleanText(body.subtitle, 240) || null,
    eyebrow: cleanText(body.eyebrow, 80) || null,
    image_url: cleanText(body.image_url, 1200),
    mobile_image_url: cleanText(body.mobile_image_url, 1200) || null,
    alt_text: cleanText(body.alt_text, 180),
    button_text: cleanText(body.button_text, 80) || null,
    destination_type: cleanText(body.destination_type, 40) || null,
    destination_value: cleanText(body.destination_value, 240) || null,
    text_position: ["left", "center", "right"].includes(body.text_position) ? body.text_position : "left",
    is_active: Boolean(body.is_active),
    display_order: Number.isInteger(Number(body.display_order)) ? Number(body.display_order) : 0,
    start_at: optionalDate(body.start_at),
    end_at: optionalDate(body.end_at),
    updated_at: new Date().toISOString(),
  };
}

function categoryPayload(body) {
  return {
    category_name: cleanText(body.category_name, 120),
    image_url: cleanText(body.image_url, 1200),
    alt_text: cleanText(body.alt_text, 180),
    display_order: Number.isInteger(Number(body.display_order)) ? Number(body.display_order) : 0,
    is_active: Boolean(body.is_active),
    start_at: optionalDate(body.start_at),
    end_at: optionalDate(body.end_at),
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;
    const user = await requireAdmin(req, res);
    if (!user) return;
    const supabaseAdmin = getSupabaseAdmin();

    if (req.method === "GET") {
      const [sections, banners, featured, products] = await Promise.all([
        supabaseAdmin.from("home_sections").select("*").order("display_order"),
        supabaseAdmin.from("home_banners").select("*").order("display_order"),
        supabaseAdmin.from("featured_categories").select("*").order("display_order"),
        supabaseAdmin.from("products").select("category"),
      ]);
      const firstError = sections.error || banners.error || featured.error || products.error;
      if (firstError) {
        console.error("[admin/home-config] Error cargando configuración:", firstError);
        return sendJson(res, 500, { ok: false, error: "No se pudo cargar la configuración de Inicio." });
      }
      return sendJson(res, 200, {
        ok: true,
        sections: sections.data || [],
        banners: banners.data || [],
        featuredCategories: featured.data || [],
        productCategories: [...new Set((products.data || []).map((item) => item.category).filter(Boolean))].sort(),
      });
    }

    const entity = String(req.body?.entity || "");
    const table = TABLES[entity];
    if (!table) return sendJson(res, 400, { ok: false, error: "El tipo de configuración no es válido." });
    const id = String(req.body?.id ?? "").trim();

    if (req.method === "DELETE") {
      if (!/^\d+$/.test(id)) return sendJson(res, 400, { ok: false, error: "El ID no es válido." });
      const mediaFields = entity === "banner" ? "image_url,mobile_image_url" : entity === "category" ? "image_url" : "id";
      const { data: previousItem } = await supabaseAdmin.from(table).select(mediaFields).eq("id", id).maybeSingle();
      const { data, error } = await supabaseAdmin.from(table).delete().eq("id", id).select("id");
      if (error) {
        console.error("[admin/home-config] Error eliminando registro:", { entity, id, error });
        return sendJson(res, error.code === "23503" ? 409 : 500, {
          ok: false,
          error: error.code === "23503" ? "El registro está en uso y no puede eliminarse." : "No se pudo eliminar el registro.",
        });
      }
      if (data?.length !== 1) return sendJson(res, 404, { ok: false, error: "El registro no existe." });
      const removedMedia = await removeUnusedEditorialMedia(supabaseAdmin, [
        previousItem?.image_url,
        previousItem?.mobile_image_url,
      ]);
      return sendJson(res, 200, { ok: true, deletedId: data[0].id, removedMedia });
    }

    let payload;
    if (entity === "section") payload = sectionPayload(req.body);
    if (entity === "banner") payload = bannerPayload(req.body);
    if (entity === "category") payload = categoryPayload(req.body);

    if (entity === "banner" && (!payload.title || !validUrl(payload.image_url))) {
      return sendJson(res, 400, { ok: false, error: "El banner necesita título e imagen HTTPS válida." });
    }
    if (entity === "category") {
      if (!payload.category_name || !validUrl(payload.image_url)) {
        return sendJson(res, 400, { ok: false, error: "La categoría necesita nombre e imagen HTTPS válida." });
      }
      const { data: matchingProducts, error: categoryError } = await supabaseAdmin
        .from("products").select("id").eq("category", payload.category_name).limit(1);
      if (categoryError || !matchingProducts?.length) {
        return sendJson(res, 400, { ok: false, error: "La categoría seleccionada no existe en el catálogo." });
      }
      let duplicateQuery = supabaseAdmin.from(table).select("id").eq("category_name", payload.category_name);
      if (id) duplicateQuery = duplicateQuery.neq("id", id);
      const { data: duplicates } = await duplicateQuery.limit(1);
      if (duplicates?.length) {
        return sendJson(res, 409, { ok: false, error: "La categoría ya está destacada." });
      }
    }

    if (id && !/^\d+$/.test(id)) {
      return sendJson(res, 400, { ok: false, error: "El ID no es válido." });
    }
    if (entity === "section" && !id) {
      return sendJson(res, 400, { ok: false, error: "Las secciones existentes se editan por su ID." });
    }

    const mediaFields = entity === "banner" ? "image_url,mobile_image_url" : entity === "category" ? "image_url" : "id";
    const { data: previousItem } = id
      ? await supabaseAdmin.from(table).select(mediaFields).eq("id", id).maybeSingle()
      : { data: null };
    const query = id
      ? supabaseAdmin.from(table).update(payload).eq("id", id)
      : supabaseAdmin.from(table).insert(payload);
    const { data, error } = await query.select("*");
    if (error) {
      console.error("[admin/home-config] Error guardando registro:", { entity, id, error });
      return sendJson(res, 500, { ok: false, error: "No se pudo guardar la configuración." });
    }
    if (data?.length !== 1) return sendJson(res, 404, { ok: false, error: "Supabase no confirmó el cambio." });
    const removedMedia = await removeUnusedEditorialMedia(supabaseAdmin, [
      previousItem?.image_url !== data[0].image_url ? previousItem?.image_url : "",
      previousItem?.mobile_image_url !== data[0].mobile_image_url ? previousItem?.mobile_image_url : "",
    ]);
    return sendJson(res, 200, { ok: true, item: data[0], removedMedia });
  } catch (error) {
    console.error("[admin/home-config] Error inesperado:", error);
    return sendJson(res, 500, { ok: false, error: "No fue posible administrar Inicio." });
  }
}
