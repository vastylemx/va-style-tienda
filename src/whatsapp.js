export const WHATSAPP_MESSAGE =
  "Hola, vengo de su app y me gustaría recibir información sobre el mayoreo.";

export const WHATSAPP_NUMBERS = Object.freeze({
  sales: "524776311393",
});

export const WHATSAPP_VISITOR_STORAGE_KEY = "vaStyleWhatsAppVisitorId";
export const WHATSAPP_ASSIGNMENT_STORAGE_KEY = "vaStyleWhatsAppAdvisorAssignment";

export function buildWhatsAppUrl(phoneNumber = WHATSAPP_NUMBERS.sales) {
  const normalizedPhone = String(phoneNumber || "").replace(/\D/g, "");
  const destination = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "https://wa.me/";
  return `${destination}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
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

function readStoredAssignment(storage, visitorId) {
  if (!storage) return null;

  try {
    const parsed = JSON.parse(storage.getItem(WHATSAPP_ASSIGNMENT_STORAGE_KEY) || "null");
    const advisorId = Number(parsed?.advisor_id);
    const advisorPhone = String(parsed?.advisor_phone || "").replace(/\D/g, "");
    if (
      parsed?.visitor_id !== visitorId ||
      ![1, 2, 3].includes(advisorId) ||
      !/^[0-9]{10,15}$/.test(advisorPhone)
    ) {
      return null;
    }
    return {
      advisorId,
      advisorPhone,
      assignedAt: String(parsed.assigned_at || ""),
    };
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

export async function openAssignedWhatsApp() {
  const popup = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
  if (popup) popup.opener = null;

  let phoneNumber = WHATSAPP_NUMBERS.sales;
  let advisorLine = null;
  let fallback = true;
  const storage = getLocalStorage();
  const visitorId = getOrCreateVisitorId(storage);
  const storedAssignment = readStoredAssignment(storage, visitorId);
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
        advisorLine: storedAssignment?.advisorId || null,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.phoneNumber || ![1, 2, 3].includes(Number(payload.advisorLine))) {
      throw new Error(payload?.error || "Asignación de WhatsApp inválida.");
    }
    phoneNumber = payload.phoneNumber;
    advisorLine = Number(payload.advisorLine);
    fallback = false;
    storeAssignment(
      storage,
      visitorId,
      advisorLine,
      phoneNumber,
      storedAssignment?.advisorId === advisorLine ? storedAssignment.assignedAt : ""
    );
  } catch (error) {
    console.error("[WhatsApp] Se utilizará la línea principal de respaldo:", error);
  } finally {
    window.clearTimeout(timeout);
  }

  const url = buildWhatsAppUrl(phoneNumber);
  if (popup && !popup.closed) {
    popup.location.replace(url);
  } else if (typeof window !== "undefined") {
    window.location.assign(url);
  }

  return { advisorLine, phoneNumber, fallback, url };
}
