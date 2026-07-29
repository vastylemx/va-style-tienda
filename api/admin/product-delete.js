import { requireAdmin } from "../_lib/require-admin.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (!requireMethod(req, res, "DELETE")) return;

    const user = await requireAdmin(req, res);
    if (!user) return;

    const productId = String(req.body?.productId ?? "").trim();

    if (!/^[a-z0-9_-]{1,128}$/i.test(productId)) {
      return sendJson(res, 400, {
        ok: false,
        error: "El ID del producto no es válido.",
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: product, error: readError } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (readError) {
      console.error("[admin/product-delete] Error consultando el producto:", {
        productId,
        readError,
      });
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo consultar el producto.",
      });
    }

    if (!product) {
      return sendJson(res, 404, {
        ok: false,
        error: "El producto no existe.",
      });
    }

    const { data: deletedProducts, error: deleteError } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", productId)
      .select("id");

    const deletedProduct = deletedProducts?.[0] || null;

    if (deleteError || !deletedProduct) {
      console.error("[admin/product-delete] Supabase no confirmó el DELETE:", {
        productId,
        deleteError,
        deletedProducts,
      });

      const hasForeignKeyConflict = deleteError?.code === "23503";
      const status = hasForeignKeyConflict ? 409 : deleteError ? 500 : 404;
      return sendJson(res, status, {
        ok: false,
        error: hasForeignKeyConflict
          ? "El producto está relacionado con otros registros y no puede eliminarse hasta resolver esas relaciones."
          : deleteError
            ? "Supabase no pudo eliminar el producto."
            : "El producto ya no existe.",
        code: deleteError?.code || "",
      });
    }

    const { data: productAfterDelete, error: verificationError } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (verificationError || productAfterDelete) {
      console.error("[admin/product-delete] El producto continúa después del DELETE:", {
        productId,
        verificationError,
        productAfterDelete,
      });
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo confirmar la eliminación del producto.",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      confirmedDeleted: true,
      deletedProductId: deletedProduct.id,
    });
  } catch (error) {
    console.error("[admin/product-delete] Error inesperado:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "No fue posible eliminar el producto.",
    });
  }
}
