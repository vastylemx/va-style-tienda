export function setPrivateJsonHeaders(res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export function sendJson(res, status, body) {
  setPrivateJsonHeaders(res);
  return res.status(status).json(body);
}

export function requireMethod(req, res, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];

  if (methods.includes(req.method)) return true;

  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { ok: false, error: "Método no permitido." });
  return false;
}
