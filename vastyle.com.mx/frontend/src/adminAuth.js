import { adminFetch, setAdminCsrfToken } from "./adminApi";

export async function signInAdmin(email, password) {
  const result = await adminFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email: String(email || "").trim(), password }),
  });
  setAdminCsrfToken(result?.csrfToken);
  return result;
}

export async function signOutAdmin() {
  try {
    await adminFetch("/api/admin/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    setAdminCsrfToken("");
  }
}

export async function getAdminSession() {
  try {
    const result = await adminFetch("/api/admin/me");
    setAdminCsrfToken(result?.csrfToken);
    return result?.admin || null;
  } catch (error) {
    if (error?.status === 401) {
      setAdminCsrfToken("");
      return null;
    }
    throw error;
  }
}

export async function verifyAdminSession() {
  const admin = await getAdminSession();
  if (!admin?.id) throw new Error("No existe una sesión administrativa válida.");
  return admin;
}
