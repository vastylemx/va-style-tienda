async function requestApi(path, options = {}) {
  const response = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    cache: "no-store",
    ...options,
    headers: {
      ...(typeof FormData !== "undefined" && options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `La solicitud falló (${response.status}).`);
  }

  return payload;
}

export async function getApiData(path, options) {
  const payload = await requestApi(path, options);
  return payload?.data ?? payload;
}

export async function postApi(path, body) {
  return requestApi(path, { method: "POST", body: JSON.stringify(body) });
}

export async function uploadReviewMedia(file) {
  const form = new FormData();
  form.append("file", file);
  return requestApi("upload-review-media", { method: "POST", body: form });
}
