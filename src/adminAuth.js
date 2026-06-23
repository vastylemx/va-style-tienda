import { supabase } from "./supabase";
import { adminFetch } from "./adminApi";

export async function signInAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });

  if (error) throw error;
  if (!data?.session?.access_token || !data?.user) {
    throw new Error("Supabase no devolvió una sesión válida. Intenta iniciar sesión nuevamente.");
  }

  try {
    const admin = await verifyAdminSession(data.session);
    return { session: data.session, admin };
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAdminSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  return data?.session || null;
}

export async function verifyAdminSession(session) {
  if (!session?.access_token) {
    throw new Error("No existe una sesión administrativa válida.");
  }

  const response = await adminFetch("/api/admin/me", { method: "GET" });

  if (response?.ok !== true || !response?.user?.id || response.user.role !== "admin") {
    throw new Error("No fue posible validar los permisos de administrador.");
  }

  return response.user;
}

export function subscribeToAdminSession(callback) {
  const authStateResult = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  const subscription = authStateResult?.data?.subscription;

  return () => subscription?.unsubscribe();
}
