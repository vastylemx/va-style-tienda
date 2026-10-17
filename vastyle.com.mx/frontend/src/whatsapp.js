export const WHATSAPP_MESSAGE =
  "Hola, vengo de su app y me gustaría recibir información sobre el mayoreo.";

export const WHATSAPP_VISITOR_STORAGE_KEY = "vaStyleWhatsAppVisitorId";
export const WHATSAPP_ASSIGNMENT_STORAGE_KEY = "vaStyleWhatsAppAdvisorAssignment";

export function buildWhatsAppUrl(phoneNumber = "", message = WHATSAPP_MESSAGE) {
  const normalizedPhone = String(phoneNumber || "").replace(/\D/g, "");
  if (!/^[0-9]{10,15}$/.test(normalizedPhone)) return "#";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message || WHATSAPP_MESSAGE)}`;
}

export function trackAdvisorWhatsApp(screen, advisorLine, fallback = false) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "whatsapp_click", {
    source: "app",
    screen,
    advisor_line: advisorLine || undefined,
    fallback,
  });
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getLocalStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probeKey = "__va_style_storage_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch (error) {
    console.warn("[WhatsApp] localStorage no está disponible:", error);
    return null;
  }
}

function getOrCreateVisitorId(storage) {
  if (!storage) return createRequestId();

  try {
    const storedVisitorId = storage.getItem(WHATSAPP_VISITOR_STORAGE_KEY);
    if (storedVisitorId) return storedVisitorId;
    const visitorId = createRequestId();
    storage.setItem(WHATSAPP_VISITOR_STORAGE_KEY, visitorId);
    return visitorId;
  } catch (error) {
    console.warn("[WhatsApp] No fue posible recuperar el identificador del visitante:", error);
    return createRequestId();
  }
}

function getStoredAssignment(storage, visitorId) {
  if (!storage) return null;

  try {
    const assignment = JSON.parse(storage.getItem(WHATSAPP_ASSIGNMENT_STORAGE_KEY) || "null");
    const advisorId = Number(assignment?.advisor_id);
    if (assignment?.visitor_id !== visitorId || ![1, 2, 3, 4, 5].includes(advisorId)) return null;
    return advisorId;
  } catch (error) {
    console.warn("[WhatsApp] No fue posible leer la asignación guardada:", error);
    return null;
  }
}

function storeAssignment(storage, visitorId, advisorId, advisorPhone, assignedAt = "") {
  if (!storage) return;

  try {
    storage.setItem(WHATSAPP_ASSIGNMENT_STORAGE_KEY, JSON.stringify({
      visitor_id: visitorId,
      advisor_id: advisorId,
      advisor_phone: advisorPhone,
      assigned_at: assignedAt || new Date().toISOString(),
    }));
  } catch (error) {
    console.warn("[WhatsApp] No fue posible guardar la asignación:", error);
  }
}

export async function openAssignedWhatsApp(postId = null, preferredAdvisorLine = null, options = {}) {
  const popup = options.popup || (typeof window !== "undefined" ? window.open("about:blank", "_blank") : null);
  if (popup) popup.opener = null;

  const storage = getLocalStorage();
  const visitorId = getOrCreateVisitorId(storage);
  const storedAdvisorId = getStoredAssignment(storage, visitorId);
  const requestId = createRequestId();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch("/api/whatsapp/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        visitorId,
        ...(storedAdvisorId ? { advisorLine: storedAdvisorId } : {}),
        ...(postId !== null && postId !== undefined ? { postId } : {}),
        ...(preferredAdvisorLine !== null ? { preferredAdvisorLine } : {}),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const phoneNumber = String(payload?.phoneNumber || "").replace(/\D/g, "");
    const advisorLine = Number(payload?.advisorLine);
    if (!response.ok || !/^[0-9]{10,15}$/.test(phoneNumber) || ![1, 2, 3, 4, 5].includes(advisorLine)) {
      throw new Error(payload?.error || "Asignación de WhatsApp inválida.");
    }
    storeAssignment(storage, visitorId, advisorLine, phoneNumber);
    const url = buildWhatsAppUrl(phoneNumber, options.message);
    if (popup && !popup.closed) {
      popup.location.replace(url);
    } else {
      window.location.assign(url);
    }
    return { advisorLine, phoneNumber, fallback: false, url };
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    console.error("[WhatsApp] No fue posible asignar un asesor:", error);
    window.alert("No fue posible asignar un asesor en este momento. Intenta nuevamente más tarde.");
    return { advisorLine: null, phoneNumber: "", fallback: true, url: "" };
  } finally {
    window.clearTimeout(timeout);
  }
}
