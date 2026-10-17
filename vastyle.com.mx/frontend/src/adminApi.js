let csrfToken = "";

export function setAdminCsrfToken(value) {
  csrfToken = typeof value === "string" ? value : "";
}

export class AdminApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
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
