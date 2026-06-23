import { supabase } from "./supabase";

export class AdminApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function adminFetch(path, options = {}) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  const session = data?.session || null;

  if (sessionError || !session?.access_token) {
    throw new AdminApiError("Inicia sesión como administrador.", 401);
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${session.access_token}`);

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AdminApiError(
      payload?.error || "No fue posible completar la solicitud administrativa.",
      response.status,
      payload
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new AdminApiError(
      "El servidor de autenticación devolvió una respuesta inválida.",
      response.status,
      payload
    );
  }

  return payload;
}
