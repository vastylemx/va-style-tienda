import { supabase } from "./supabase";
import logo from "./assets/5EBEC563-AD5B-47FB-AFE9-482289C13B90.jpg";
import { useState, useEffect, useRef } from "react";
import CommunityFeed from "./CommunityFeed";
import CommunityAdmin from "./CommunityAdmin";
import AdminLogin from "./AdminLogin";
import {
  getAdminSession,
  signOutAdmin,
  subscribeToAdminSession,
  verifyAdminSession,
} from "./adminAuth";

const categories = [
  "Todas",
  "Bolsas",
  "Carteras",
  "Mochilas",
  "Crossbody",
  "Maleta",
  "Muñequera",
  "Línea económica",
  "Hombre",
  "Calzado",
];

const PRODUCTS_PER_PAGE = 20;
const TEST_COMMUNITY = false;
const COMMUNITY_UNREAD_COUNT = 1; // TODO: reemplazar por conteo real de novedades/comunidad.

const CART_STORAGE_KEY = "vaStyleCart";
const ORDER_SENT_KEY = "vaStyleOrderSent";
const LAST_ADVISOR_KEY = "vaStyleLastAdvisor";
const TEST_FREE_SHIPPING = false;
const MERCADO_PAGO_TEST_MODE = false;
const MERCADO_PAGO_MINIMUM_ITEMS = MERCADO_PAGO_TEST_MODE ? 1 : 6;
const MERCADO_PAGO_MINIMUM_AMOUNT = MERCADO_PAGO_TEST_MODE ? 6 : 50;
const MP_PENDING_ORDER_KEY = "vaStylePendingMercadoPagoOrder";
const FAVORITES_STORAGE_KEY = "vaStyleFavorites";
const INSTALL_BANNER_VIEW_KEY = "vaStyleInstallBannerViewed";

const DEFAULT_HOME_SETTINGS = {
  id: 1,
  hero_image_url: "",
  new_arrivals_image_url: "",
  best_sellers_image_url: "",
  hero_title: "Descubre V & A Style",
  hero_subtitle: "✨ Estás a un paso de comenzar tu sueño",
  new_arrivals_title: "New Arrivals",
  new_arrivals_subtitle: "Lo más nuevo para tu negocio",
  best_sellers_title: "Más vendidos",
  best_sellers_subtitle: "Los favoritos de nuestras clientas",
  show_install_banner: true,
  install_banner_title: "Instala V & A Style",
  install_banner_subtitle: "Lleva tu tienda siempre contigo",
};

const FALLBACK_HOME_IMAGE = "https://ankhvpcykeyexwnwcmqa.supabase.co/storage/v1/object/public/home-media/IMG_6310.png";

const GA_MEASUREMENT_ID = "G-TP0P6637D2";

function trackEvent(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

function getDeviceInfo() {
  if (typeof navigator === "undefined") {
    return { device: "unknown", browser: "unknown", source: "" };
  }

  const ua = navigator.userAgent || "";
  const device = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "desktop";

  const browser = /CriOS|Chrome/i.test(ua)
    ? "chrome"
    : /Safari/i.test(ua)
      ? "safari"
      : /Firefox/i.test(ua)
        ? "firefox"
        : "other";

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  return { device, browser, source: params.get("utm_source") || params.get("source") || "" };
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function getCleanPrice(value) {
  if (value === null || value === undefined) return 0;

  const cleanValue = String(value)
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "");

  const numberValue = parseFloat(cleanValue);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getDiscountPercent(value) {
  const percent = getCleanPrice(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(Math.max(percent, 0), 100);
}

function getFinalPrice(product) {
  const originalPrice = getCleanPrice(product?.price);
  const discountPercent = getDiscountPercent(product?.discountPercent);

  if (!discountPercent) return originalPrice;

  return Math.round(originalPrice * (1 - discountPercent / 100));
}

function formatMoney(value) {
  return getCleanPrice(value).toLocaleString("es-MX");
}
function formatDate(value) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "Sin fecha";
  }
}

function getOrderId(order) {
  return order?.id || order?.order_id || order?.external_reference || "Sin ID";
}

function getOrderPaymentStatus(order) {
  const status = String(order?.payment_status || order?.status || "pending").toLowerCase();

  if (["paid", "approved", "pagado"].includes(status)) return "Pagado";
  if (["pending", "pendiente", "in_process"].includes(status)) return "Pendiente";
  if (["rejected", "cancelled", "failure", "failed"].includes(status)) return "Rechazado";

  return status.toUpperCase();
}

function getOrderStatus(order) {
  const rawStatus = order?.status || order?.order_status || order?.orderStatus || order?.fulfillment_status || "";
  const normalizedStatus = String(rawStatus || "").toLowerCase();

  if (!normalizedStatus) {
    return getOrderPaymentStatus(order) === "Pagado" ? "Pagado" : "Pendiente";
  }

  const labels = {
    pending: "Pendiente",
    pendiente: "Pendiente",
    paid: "Pagado",
    pagado: "Pagado",
    preparing: "Preparando",
    preparando: "Preparando",
    shipped: "Enviado",
    enviado: "Enviado",
    delivered: "Entregado",
    entregado: "Entregado",
    cancelled: "Cancelado",
    cancelado: "Cancelado",
    rejected: "Rechazado",
    rechazado: "Rechazado",
  };

  return labels[normalizedStatus] || rawStatus;
}

const ORDER_STATUS_OPTIONS = ["Pendiente", "Pagado", "Preparando", "Enviado", "Entregado", "Cancelado"];

function buildTelegramOrderMessage(order, title = "🛍️ Nuevo movimiento V&A Style") {
  const orderId = getOrderId(order);
  const customerName = order?.customer_name || order?.customerName || "Sin nombre";
  const customerPhone = order?.customer_phone || order?.customerPhone || "Sin teléfono";
  const orderTotal = formatMoney(order?.total || 0);
  const paymentStatus = getOrderPaymentStatus(order);
  const orderStatus = getOrderStatus(order);
  const createdAt = formatDate(order?.created_at || order?.createdAt || new Date().toISOString());

  return [
    title,
    "",
    `Cliente: ${customerName}`,
    `Teléfono: ${customerPhone}`,
    `Total: $${orderTotal} MXN`,
    `Pago: ${paymentStatus}`,
    `Pedido: ${orderStatus}`,
    `Fecha: ${createdAt}`,
    "",
    `ID: ${orderId}`,
  ].join("\n");
}

async function sendTelegramOrderNotification(order, title) {
  try {
    if (!order) return;

    const orderId = getOrderId(order);
    const paymentStatus = getOrderPaymentStatus(order);
    const notificationKey = `vaStyleTelegramNotified:${title}:${orderId}:${paymentStatus}`;

    if (typeof window !== "undefined" && localStorage.getItem(notificationKey) === "true") return;

    const response = await fetch("/api/send-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: buildTelegramOrderMessage(order, title) }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.log("Telegram notification error:", data);
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(notificationKey, "true");
    }
  } catch (error) {
    console.log("Telegram notification failed:", error);
  }
}


function getSizeOptions(value) {
  if (!value) return [];

  return String(value)
    .split(/[,.\n]+/)
    .map((size) => size.trim())
    .filter(Boolean);
}

function normalizeCategory(value) {
  return value === "Tenis" ? "Calzado" : value;
}

function getDefaultShippingFactor(category) {
  const normalizedCategory = normalizeCategory(category);

  switch (normalizedCategory) {
    case "Muñequera":
      return 0.2;
    case "Carteras":
      return 0.3;
    case "Mochilas":
      return 1.5;
    case "Crossbody":
    case "Bolsas":
    case "Hombre":
    case "Calzado":
      return 1;
    case "Maleta":
      return 4;
    default:
      return 1;
  }
}

function getShippingCost(pieces) {
  if (TEST_FREE_SHIPPING) return 0;

  const safePieces = Number(pieces) || 0;

  if (safePieces <= 0) return 0;
  if (safePieces <= 10) return 380;
  if (safePieces <= 24) return 450;
  if (safePieces <= 40) return 580;

  return null;
}

function getServiceFee(amount) {
  if (TEST_FREE_SHIPPING) return 0;

  const baseAmount = getCleanPrice(amount);
  if (baseAmount <= 0) return 0;

  return Math.min(Math.round(baseAmount * 0.025 + 4), 100);
}

function getItemShippingFactor(item) {
  const directFactor = Number(item?.shippingFactor);
  const databaseFactor = Number(item?.shipping_factor);

  if (Number.isFinite(directFactor) && directFactor > 0) return directFactor;
  if (Number.isFinite(databaseFactor) && databaseFactor > 0) return databaseFactor;

  return getDefaultShippingFactor(item?.category);
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter(Boolean)
    .map((item) => ({
      ...item,
      price: getCleanPrice(item?.price || item?.originalPrice || 0),
      originalPrice: getCleanPrice(item?.originalPrice || item?.price || 0),
      discountPercent: getDiscountPercent(item?.discountPercent || item?.discount_percent),
      shippingFactor: getItemShippingFactor(item),
    }));
}


function getSessionRandomizedTopGroups(groups, topCount, randomIdsRef) {
  if (!Array.isArray(groups) || groups.length <= 1) return groups;

  if (!randomIdsRef.current.length) {
    const shuffled = [...groups];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
    }

    randomIdsRef.current = shuffled.slice(0, topCount).map((group) => group.id);
  }

  const randomIdSet = new Set(randomIdsRef.current);
  const randomTopGroups = randomIdsRef.current
    .map((id) => groups.find((group) => group.id === id))
    .filter(Boolean);
  const remainingGroups = groups.filter((group) => !randomIdSet.has(group.id));

  return [...randomTopGroups, ...remainingGroups];
}

function getProductInfo(product) {
  const rawName = String(product?.name || "").trim().toUpperCase();
  const parts = rawName.split(/\s+/).filter(Boolean);
  const firstPart = parts[0] || rawName;
  const looksLikeCode = /^[A-Z]*\d+[A-Z0-9-]*$/.test(firstPart);
  const code = looksLikeCode ? firstPart : rawName;
  const color = looksLikeCode ? parts.slice(1).join(" ") : "";

  return {
    code,
    color: color || "COLOR / VARIANTE",
  };
}

function buildGroupedProducts(productList) {
  const groups = new Map();

  productList.forEach((product) => {
    const info = getProductInfo(product);
    const key = [info.code, product.brand || "", product.category || "", product.price || ""].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        code: info.code,
        name: info.code,
        brand: product.brand || "",
        category: product.category,
        price: product.price,
        discountPercent: product.discountPercent,
        shippingFactor: getItemShippingFactor(product),
        created_at: product.created_at,
        image: product.image,
        sizes: product.sizes || "",
        variants: [],
      });
    }

    const group = groups.get(key);
    group.variants.push({
      ...product,
      modelCode: info.code,
      variantColor: info.color,
    });

    if (new Date(product.created_at || 0) > new Date(group.created_at || 0)) {
      group.created_at = product.created_at;
      group.image = product.image;
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    variants: group.variants.sort((a, b) =>
      String(a.variantColor || a.name).localeCompare(String(b.variantColor || b.name), "es", {
        numeric: true,
        sensitivity: "base",
      })
    ),
  }));
}

function getCartSummary(cartItems) {
  const summary = new Map();

  cartItems.forEach((item) => {
    const key = [
      item.modelCode || item.name,
      item.variantColor || "",
      item.brand || "",
      item.selectedSize || "",
      item.discountPercent || "",
      item.price || "",
    ].join("|");

    if (!summary.has(key)) {
      summary.set(key, { ...item, quantity: 0 });
    }

    summary.get(key).quantity += 1;
  });

  return Array.from(summary.values());
}

function compressImage(file, maxWidth = 1200, quality = 0.78) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith("image/")) {
      resolve(file);
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement("canvas");

        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, "") + ".jpg",
              { type: "image/jpeg", lastModified: Date.now() }
            );

            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = event.target.result;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3C8.8 3 3 8.6 3 15.5c0 2.4.7 4.7 2 6.7L3.8 29l7-1.8c1.6.8 3.4 1.2 5.2 1.2 7.2 0 13-5.6 13-12.5S23.2 3 16 3Zm0 22.9c-1.7 0-3.3-.4-4.7-1.2l-.4-.2-4.1 1.1.8-4-.3-.4c-1.1-1.7-1.7-3.6-1.7-5.6 0-5.6 4.7-10.1 10.4-10.1s10.4 4.5 10.4 10.1S21.7 25.9 16 25.9Zm5.7-7.6c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.8.2-.2.3-.9 1-.1.2-.2.2-.4.3-.7.1-2-.9-3.3-2.1-4.1-4-.1-.3 0-.5.1-.7.1-.1.3-.4.5-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.6-.1-.2-.8-1.8-1.1-2.4-.3-.6-.5-.5-.8-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.7 5 .8.3 1.5.5 2 .7.8.2 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M18.2 29V17.7h3.8l.6-4.4h-4.4v-2.8c0-1.3.4-2.1 2.2-2.1h2.3V4.5c-.4-.1-1.8-.2-3.4-.2-3.4 0-5.7 2.1-5.7 5.8v3.2H9.8v4.4h3.8V29h4.6Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 8.2c2.5 0 2.8 0 3.8.1.9 0 1.4.2 1.8.3.5.2.8.4 1.1.7.3.3.5.7.7 1.1.1.3.3.9.3 1.8.1 1 .1 1.3.1 3.8s0 2.8-.1 3.8c0 .9-.2 1.4-.3 1.8-.2.5-.4.8-.7 1.1-.3.3-.7.5-1.1.7-.3.1-.9.3-1.8.3-1 .1-1.3.1-3.8.1s-2.8 0-3.8-.1c-.9 0-1.4-.2-1.8-.3-.5-.2-.8-.4-1.1-.7-.3-.3-.5-.7-.7-1.1-.1-.3-.3-.9-.3-1.8-.1-1-.1-1.3-.1-3.8s0-2.8.1-3.8c0-.9.2-1.4.3-1.8.2-.5.4-.8.7-1.1.3-.3.7-.5 1.1-.7.3-.1.9-.3 1.8-.3 1-.1 1.3-.1 3.8-.1Zm0-2.7c-2.5 0-2.9 0-3.9.1-1 0-1.8.2-2.4.5-.7.3-1.3.6-1.8 1.2-.6.6-.9 1.1-1.2 1.8-.2.6-.4 1.4-.5 2.4 0 1-.1 1.3-.1 3.9s0 2.9.1 3.9c0 1 .2 1.8.5 2.4.3.7.6 1.3 1.2 1.8.6.6 1.1.9 1.8 1.2.6.2 1.4.4 2.4.5 1 .1 1.3.1 3.9.1s2.9 0 3.9-.1c1 0 1.8-.2 2.4-.5.7-.3 1.3-.6 1.8-1.2.6-.6.9-1.1 1.2-1.8.2-.6.4-1.4.5-2.4.1-1 .1-1.3.1-3.9s0-2.9-.1-3.9c0-1-.2-1.8-.5-2.4-.3-.7-.6-1.3-1.2-1.8-.6-.6-1.1-.9-1.8-1.2-.6-.2-1.4-.4-2.4-.5-1-.1-1.3-.1-3.9-.1Zm0 4.8a5.7 5.7 0 1 0 0 11.4 5.7 5.7 0 0 0 0-11.4Zm0 9.4a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4Zm5.9-9.6a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M22.7 9.7c-1.6-.9-2.7-2.4-3-4.2h-4.2v15c0 2-1.6 3.6-3.6 3.6s-3.6-1.6-3.6-3.6 1.6-3.6 3.6-3.6c.4 0 .8.1 1.2.2v-4.2c-.4-.1-.8-.1-1.2-.1-4.3 0-7.8 3.5-7.8 7.8s3.5 7.8 7.8 7.8 7.8-3.5 7.8-7.8v-7.9c1.7 1.2 3.8 1.9 6 1.9V10c-1.1 0-2.1-.1-3-.3Z" />
    </svg>
  );
}

export default function App() {
  const [showCommunity, setShowCommunity] = useState(TEST_COMMUNITY);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showroomItems, setShowroomItems] = useState([]);
  const [homeSettings, setHomeSettings] = useState(DEFAULT_HOME_SETTINGS);
  const [homeForm, setHomeForm] = useState({
    heroFile: null,
    newArrivalsFile: null,
    bestSellersFile: null,
    saving: false,
  });
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [canInstallApp, setCanInstallApp] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [currentView, setCurrentView] = useState("home");
  const [favorites, setFavorites] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [category, setCategory] = useState("Todas");
  const [cart, setCart] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      return normalizeCartItems(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]"));
    } catch {
      return [];
    }
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminAuthLoading, setAdminAuthLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [toast, setToast] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("az");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSizes, setSelectedSizes] = useState({});
  const [adminModal, setAdminModal] = useState(null);
  const [bulkUpload, setBulkUpload] = useState({
    baseName: "",
    brand: "",
    category: "Bolsas",
    sizes: "",
    discount_percent: "",
    isNewArrival: false,
    isBestSeller: false,
    isHomeFeatured: false,
    precio_mayorista: "",
    files: [],
    uploading: false,
    progress: "",
  });

  const [reviewForm, setReviewForm] = useState({
    name: "",
    rating: "5",
    comment: "",
    mediaFile: null,
  });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showroomForm, setShowroomForm] = useState({
    imageFile: null,
    uploading: false,
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedGallery, setSelectedGallery] = useState([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedProductGroup, setSelectedProductGroup] = useState(null);
  const [variantQuantities, setVariantQuantities] = useState({});
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", phone: "" });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [advisorOrderModalOpen, setAdvisorOrderModalOpen] = useState(false);
  const [advisorOrderForm, setAdvisorOrderForm] = useState({ name: "", phone: "" });
  const [advisorOrderLoading, setAdvisorOrderLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [newOrderNotice, setNewOrderNotice] = useState("");

  const catalogRef = useRef(null);
  const cartRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const reviewsRef = useRef(null);
  const lastTapRef = useRef(0);
  const dragRef = useRef(null);
  const toastTimerRef = useRef(null);
  const randomTopProductGroupsRef = useRef([]);

  const [newProduct, setNewProduct] = useState({
    name: "",
    brand: "",
    category: "Bolsas",
    sizes: "",
    discount_percent: "",
    isNewArrival: false,
    isBestSeller: false,
    isHomeFeatured: false,
    precio_mayorista: "",
    shipping_factor: "1",
    imageFile: null,
    image_url: "",
  });

  useEffect(() => {
    fetchProducts();
    fetchReviews();
    fetchShowroomArrivals();
    fetchHomeSettings();

    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
      setCanInstallApp(true);
    };

    const handleAppInstalled = () => {
      setCanInstallApp(false);
      setDeferredInstallPrompt(null);
      recordInstallEvent("installed");
      trackEvent("app_installed", { platform: "pwa" });
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch((error) => {
        console.log("Service worker registration failed:", error);
      });
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function gtag() {
        window.dataLayer.push(arguments);
      };

    if (!document.getElementById("google-analytics-script")) {
      const script = document.createElement("script");
      script.id = "google-analytics-script";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }

    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID);

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");

    if (paymentStatus === "success") {
      const pendingOrderRaw = localStorage.getItem(MP_PENDING_ORDER_KEY);
      let pendingOrder = null;

      try {
        pendingOrder = pendingOrderRaw ? JSON.parse(pendingOrderRaw) : null;
      } catch {
        pendingOrder = null;
      }

      trackEvent("purchase", {
        transaction_id: pendingOrder?.orderId || "mercadopago_success",
        value: pendingOrder?.total || 0,
        currency: "MXN",
        payment_method: "mercadopago",
        items: pendingOrder?.items || 0,
      });


      localStorage.removeItem(MP_PENDING_ORDER_KEY);
      localStorage.removeItem(CART_STORAGE_KEY);
      setCart([]);
      showToast("Pago recibido ✅ Carrito limpiado");
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (paymentStatus === "pending") {
      showToast("Pago pendiente de confirmación ⏳");
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (paymentStatus === "failure") {
      showToast("El pago no se completó");
      window.history.replaceState({}, "", window.location.pathname);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function clearExpiredAdminSession(error, context) {
      console.error(context, error);

      if (active) {
        setShowAdmin(false);
        setAdminModal(null);
        setShowAdminLogin(false);
      }

      try {
        await signOutAdmin();
      } catch (signOutError) {
        console.error("No fue posible limpiar la sesión administrativa expirada:", signOutError);
      } finally {
        if (active) await fetchProducts();
      }
    }

    async function restoreAdminSession() {
      try {
        const session = await getAdminSession();
        if (!session) return;

        const admin = await verifyAdminSession(session);
        if (active) setShowAdmin(Boolean(admin));
      } catch (error) {
        await clearExpiredAdminSession(error, "No fue posible restaurar la sesión administrativa:");
      } finally {
        if (active) setAdminAuthLoading(false);
      }
    }

    void restoreAdminSession();

    const unsubscribe = subscribeToAdminSession((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT" || !session) {
        setShowAdmin(false);
        setAdminModal(null);
        setAdminAuthLoading(false);
        return;
      }

      window.setTimeout(async () => {
        try {
          const admin = await verifyAdminSession(session);
          if (active) setShowAdmin(Boolean(admin));
        } catch (error) {
          await clearExpiredAdminSession(error, "La sesión no tiene acceso administrativo:");
        } finally {
          if (active) setAdminAuthLoading(false);
        }
      }, 0);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!showAdmin) return;

    fetchProducts();
    fetchOrders();

    const channel = supabase
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          fetchOrders();

          if (payload.eventType === "INSERT") {
            const customerName = payload.new?.customer_name || "Nuevo cliente";
            setNewOrderNotice(`Nuevo pedido recibido: ${customerName}`);
            showToast("Nuevo pedido recibido 🛍️");
            if (payload.new?.payment_method !== "asesor") {
              sendTelegramOrderNotification(payload.new, "🛍️ Nuevo pedido creado");
            }
          }

        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showAdmin]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    setCurrentPage(1);

    if (category) {
      trackEvent("select_category", {
        category,
      });
    }
  }, [category, searchTerm]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "auto";
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function fetchHomeSettings() {
    const { data, error } = await supabase
      .from("home_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.log(error);
      return;
    }

    setHomeSettings({ ...DEFAULT_HOME_SETTINGS, ...(data || {}) });
  }

  async function recordInstallEvent(eventType) {
    try {
      const info = getDeviceInfo();

      await supabase.from("app_installs").insert([
        {
          event_type: eventType,
          device: info.device,
          browser: info.browser,
          source: info.source,
        },
      ]);
    } catch (error) {
      console.log("Install event error:", error);
    }
  }

  async function handleInstallAppClick() {
    trackEvent("install_app_click", { location: "home_banner" });
    recordInstallEvent("install_click");

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      setDeferredInstallPrompt(null);
      setCanInstallApp(false);

      if (result?.outcome === "accepted") {
        recordInstallEvent("installed");
        trackEvent("app_installed", { platform: "pwa" });
      }

      return;
    }

    if (isIOSDevice()) {
      recordInstallEvent("ios_instruction_view");
      alert("Para instalar V & A Style en iPhone: toca Compartir en Safari y después elige Agregar a pantalla de inicio.");
      return;
    }

    alert("Para instalar V & A Style: abre el menú del navegador y elige Instalar app o Agregar a pantalla de inicio.");
  }

  async function fetchProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AdminProducts] Error SELECT products:", error);
      return;
    }

    setProducts(
      (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        brand: (p.brand || "").toUpperCase(),
        category: normalizeCategory(p.category),
        sizes: p.sizes || "",
        discountPercent: getDiscountPercent(p.discount_percent),
        is_new_arrival: Boolean(p.is_new_arrival),
        is_best_seller: Boolean(p.is_best_seller),
        is_home_featured: Boolean(p.is_home_featured),
        isNewArrival: Boolean(p.is_new_arrival),
        isBestSeller: Boolean(p.is_best_seller),
        isHomeFeatured: Boolean(p.is_home_featured),
        created_at: p.created_at,
        price: Number(p.wholesale_price) || 0,
        shippingFactor: Number(p.shipping_factor) || getDefaultShippingFactor(p.category),
        image: p.image_url,
      }))
    );
  }

  async function fetchReviews() {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, customer_name, rating, comment, media_url");

    if (error) {
      return;
    }

    setReviews(data || []);
  }

  async function fetchShowroomArrivals() {
    const { data, error } = await supabase
      .from("showroom_arrivals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
      return;
    }

    setShowroomItems(data || []);
  }

  async function fetchOrders() {
    setOrdersLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false });

    setOrdersLoading(false);

    if (error) {
      console.log(error);
      showToast("No se pudieron cargar los pedidos");
      return;
    }

    setOrders(data || []);
  }

  async function updateOrderStatus(order, nextStatus) {
    const orderId = getOrderId(order);
    const normalizedStatus = String(nextStatus || "").toLowerCase();

    const updateData = {
      status: normalizedStatus,
      archived: normalizedStatus === "entregado",
    };

    let result = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (result.error && String(result.error.message || "").includes("status")) {
      result = await supabase
        .from("orders")
        .update({ order_status: normalizedStatus, archived: normalizedStatus === "entregado" })
        .eq("id", orderId);
    }

    if (result.error) {
      alert(result.error.message);
      console.log(result.error);
      return;
    }

    showToast("Estado actualizado ✅");
    fetchOrders();
  }


  const pendingReviews = reviews;
  const showroomArrivals = showroomItems.slice(0, 12);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = products.filter((p) => {
    const matchesCategory = category === "Todas" || p.category === category;
    const matchesView =
      currentView === "novedades"
        ? Boolean(p.isNewArrival || p.is_new_arrival)
        : currentView === "masVendidos"
          ? Boolean(p.isBestSeller || p.is_best_seller)
          : true;

    const matchesSearch =
      !normalizedSearch ||
      p.name.toLowerCase().includes(normalizedSearch) ||
      (p.brand || "").toLowerCase().includes(normalizedSearch) ||
      p.category.toLowerCase().includes(normalizedSearch);

    return matchesCategory && matchesView && matchesSearch;
  });

  const sortedProducts = [...filtered].sort((a, b) => {
    if (sortOrder === "recent") {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }

    return String(a.name || "").localeCompare(String(b.name || ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });

  const groupedProducts = buildGroupedProducts(sortedProducts);
  const favoriteProductGroups = groupedProducts.filter((group) => favorites.includes(getFavoriteKey(group)));
  const baseProductGroups = currentView === "favoritos" ? favoriteProductGroups : groupedProducts;
  const displayedProductGroups =
    currentView === "home" && category === "Todas" && !normalizedSearch
      ? getSessionRandomizedTopGroups(baseProductGroups, PRODUCTS_PER_PAGE, randomTopProductGroupsRef)
      : baseProductGroups;
  const totalPages = Math.max(1, Math.ceil(displayedProductGroups.length / PRODUCTS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE;
  const paginatedProductGroups = displayedProductGroups.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  const cartSummary = getCartSummary(cart);
  const reviewAverage = reviews.length
    ? (
        reviews.reduce((sum, review) => sum + (Number(review.rating) || 5), 0) /
        reviews.length
      ).toFixed(1)
    : "5.0";
  const reviewCount = reviews.length;

  const subtotal = cart
    .map((item) => getCleanPrice(item.price))
    .reduce((sum, price) => sum + price, 0);

  const volumeDiscount = cart.length >= 40 ? Math.round(subtotal * 0.05) : 0;

  const shippingUnits = cart.length;

  const shippingCost = getShippingCost(shippingUnits);
  const needsShippingQuote = shippingCost === null;

  const shippingAndPaymentCost = needsShippingQuote ? null : shippingCost;
  const serviceFee = 0;
  const total = needsShippingQuote
    ? Math.max(subtotal - volumeDiscount, 0)
    : Math.max(subtotal - volumeDiscount + shippingCost, 0);

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1800);
  }

  function addToCart(product) {
    const sizeOptions = getSizeOptions(product.sizes);
    const selectedSize = product.category === "Calzado" ? selectedSizes[product.id] : "";

    if (product.category === "Calzado") {
      if (!sizeOptions.length) {
        alert("Este calzado todavía no tiene tallas registradas.");
        return;
      }

      if (!selectedSize) {
        alert("Selecciona la talla antes de agregar al carrito.");
        return;
      }
    }

    setCart((prevCart) => [
      ...prevCart,
      {
        ...product,
        selectedSize,
        originalPrice: getCleanPrice(product.price),
        discountPercent: getDiscountPercent(product.discountPercent),
        price: getFinalPrice(product),
        shippingFactor: getItemShippingFactor(product),
      },
    ]);

    trackEvent("add_to_cart", {
      item_id: product.modelCode || product.name,
      item_name: product.name,
      item_category: product.category,
      value: getFinalPrice(product),
      currency: "MXN",
    });

    showToast("Producto agregado al carrito ✅");
  }

  function openProductGroup(group) {
    setSelectedProductGroup(group);
    setVariantQuantities({});
    trackEvent("view_product_group", {
      item_id: group.code,
      item_name: group.name,
      item_category: group.category,
      variants: group.variants?.length || 0,
    });
    document.body.style.overflow = "hidden";
  }

  function closeProductGroup() {
    setSelectedProductGroup(null);
    setVariantQuantities({});
    document.body.style.overflow = "auto";
  }

  function updateVariantQuantity(productId, nextQuantity) {
    const safeQuantity = Math.max(0, Number(nextQuantity) || 0);

    setVariantQuantities((prev) => ({
      ...prev,
      [productId]: safeQuantity,
    }));
  }

  function addVariantsToCart(group) {
    const itemsToAdd = [];

    group.variants.forEach((variant) => {
      const quantity = Number(variantQuantities[variant.id] || 0);
      if (quantity <= 0) return;

      const sizeOptions = getSizeOptions(variant.sizes);
      const selectedSize = variant.category === "Calzado" ? selectedSizes[variant.id] : "";

      if (variant.category === "Calzado") {
        if (!sizeOptions.length) {
          alert(`Este calzado todavía no tiene tallas registradas: ${variant.name}`);
          return;
        }

        if (!selectedSize) {
          alert(`Selecciona la talla para ${variant.name}.`);
          return;
        }
      }

      for (let i = 0; i < quantity; i++) {
        itemsToAdd.push({
          ...variant,
          selectedSize,
          originalPrice: getCleanPrice(variant.price),
          discountPercent: getDiscountPercent(variant.discountPercent),
          price: getFinalPrice(variant),
          shippingFactor: getItemShippingFactor(variant),
        });
      }
    });

    if (!itemsToAdd.length) {
      alert("Elige al menos una pieza antes de agregar al carrito.");
      return;
    }

    setCart((prevCart) => [...prevCart, ...itemsToAdd]);

    trackEvent("add_variants_to_cart", {
      item_id: group.code,
      item_name: group.name,
      item_category: group.category,
      quantity: itemsToAdd.length,
      value: itemsToAdd.reduce((sum, item) => sum + getFinalPrice(item), 0),
      currency: "MXN",
    });

    showToast("Colores agregados al carrito ✅");
    closeProductGroup();
  }

  function addVariantDirectToCart(variant, group) {
    const sizeOptions = getSizeOptions(variant.sizes);
    const selectedSize = variant.category === "Calzado" ? selectedSizes[variant.id] : "";

    if (variant.category === "Calzado") {
      if (!sizeOptions.length) {
        alert(`Este calzado todavía no tiene tallas registradas: ${variant.name}`);
        return;
      }

      if (!selectedSize) {
        alert(`Selecciona la talla para ${variant.name}.`);
        return;
      }
    }

    const itemToAdd = {
      ...variant,
      selectedSize,
      originalPrice: getCleanPrice(variant.price),
      discountPercent: getDiscountPercent(variant.discountPercent),
      price: getFinalPrice(variant),
      shippingFactor: getItemShippingFactor(variant),
    };

    setCart((prevCart) => [...prevCart, itemToAdd]);

    trackEvent("add_variant_direct_to_cart", {
      item_id: variant.modelCode || group?.code || variant.name,
      item_name: variant.name,
      item_category: variant.category,
      value: getFinalPrice(variant),
      currency: "MXN",
    });

    showToast("Producto agregado al carrito ✅");
  }

  function openImage(product, gallery = []) {
    const safeGallery = Array.isArray(gallery) && gallery.length ? gallery : [product];
    const currentIndex = Math.max(
      0,
      safeGallery.findIndex((item) => item.id === product.id)
    );

    setSelectedGallery(safeGallery);
    setSelectedImageIndex(currentIndex);
    setSelectedProduct(safeGallery[currentIndex] || product);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
    trackEvent("view_item", {
      item_id: product.modelCode || product.name,
      item_name: product.name,
      item_category: product.category,
      value: getFinalPrice(product),
      currency: "MXN",
    });
    document.body.style.overflow = "hidden";
  }

  function closeImage() {
    setSelectedProduct(null);
    setSelectedGallery([]);
    setSelectedImageIndex(0);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
    document.body.style.overflow = "auto";
  }

  function goToGalleryImage(nextIndex) {
    if (!selectedGallery.length) return;

    const safeIndex = (nextIndex + selectedGallery.length) % selectedGallery.length;
    const nextProduct = selectedGallery[safeIndex];

    setSelectedImageIndex(safeIndex);
    setSelectedProduct(nextProduct);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });

    trackEvent("view_item", {
      item_id: nextProduct.modelCode || nextProduct.name,
      item_name: nextProduct.name,
      item_category: nextProduct.category,
      value: getFinalPrice(nextProduct),
      currency: "MXN",
    });
  }

  function nextGalleryImage() {
    goToGalleryImage(selectedImageIndex + 1);
  }

  function previousGalleryImage() {
    goToGalleryImage(selectedImageIndex - 1);
  }

  function toggleZoom() {
    if (imageZoom === 1) {
      setImageZoom(2.4);
    } else {
      setImageZoom(1);
      setImagePosition({ x: 0, y: 0 });
    }
  }

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;

    dragRef.current = {
      moved: false,
      startTime: Date.now(),
      startTouchX: e.touches[0].clientX,
      startTouchY: e.touches[0].clientY,
      lastTouchX: e.touches[0].clientX,
      lastTouchY: e.touches[0].clientY,
    };
  }

  function handleTouchMove(e) {
    if (!dragRef.current || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - dragRef.current.startTouchX;
    const deltaY = touch.clientY - dragRef.current.startTouchY;

    dragRef.current.moved = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8;
    dragRef.current.lastTouchX = touch.clientX;
    dragRef.current.lastTouchY = touch.clientY;
  }

  function handleTouchEnd() {
    const now = Date.now();
    const wasDragging = dragRef.current?.moved;
    const deltaX = (dragRef.current?.lastTouchX || 0) - (dragRef.current?.startTouchX || 0);
    const deltaY = (dragRef.current?.lastTouchY || 0) - (dragRef.current?.startTouchY || 0);
    const isHorizontalSwipe = Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4;

    if (imageZoom === 1 && selectedGallery.length > 1 && isHorizontalSwipe) {
      if (deltaX < 0) {
        nextGalleryImage();
      } else {
        previousGalleryImage();
      }
      lastTapRef.current = 0;
      dragRef.current = null;
      return;
    }

    if (!wasDragging && now - lastTapRef.current < 320) {
      toggleZoom();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }

    dragRef.current = null;
  }

  function handleMouseDown(e) {
    if (imageZoom <= 1) return;

    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: imagePosition.x,
      startY: imagePosition.y,
    };
  }

  function handleMouseMove(e) {
    if (!dragRef.current || imageZoom <= 1) return;

    const deltaX = e.clientX - dragRef.current.x;
    const deltaY = e.clientY - dragRef.current.y;

    setImagePosition({
      x: dragRef.current.startX + deltaX,
      y: dragRef.current.startY + deltaY,
    });
  }

  function handleMouseUp() {
    dragRef.current = null;
  }

  async function deleteProduct(id) {
    if (id === undefined || id === null || id === "") {
      console.error("[AdminProducts] DELETE products skipped: invalid product id", id);
      alert("No se pudo identificar el producto para borrarlo.");
      return;
    }

    const confirmDelete = confirm("¿Seguro que quieres borrar este producto?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.error("[AdminProducts] Error DELETE products:", error);
      return;
    }

    setCart((currentCart) => currentCart.filter((item) => item.id !== id));
    await fetchProducts();
    alert("Producto borrado correctamente");
  }

  function openAddProductModal() {
    setEditingProduct(null);
    setNewProduct({
      name: "",
      brand: "",
      category: "Bolsas",
      sizes: "",
      discount_percent: "",
      isNewArrival: false,
      isBestSeller: false,
      isHomeFeatured: false,
      precio_mayorista: "",
      shipping_factor: "1",
      imageFile: null,
      image_url: "",
    });
    setAdminModal("product");
  }

  function startEditProduct(product) {
    setEditingProduct(product);

    setNewProduct({
      name: product.name,
      brand: product.brand || "",
      category: product.category,
      sizes: product.sizes || "",
      discount_percent: product.discountPercent || "",
      isNewArrival: Boolean(product.isNewArrival),
      isBestSeller: Boolean(product.isBestSeller),
      isHomeFeatured: Boolean(product.isHomeFeatured),
      precio_mayorista: product.price,
      shipping_factor: String(product.shippingFactor || getDefaultShippingFactor(product.category)),
      imageFile: null,
      image_url: product.image,
    });

    setAdminModal("product");
  }

  function openBulkUploadModal() {
    setBulkUpload({
      baseName: "",
      brand: "",
      category: "Bolsas",
      sizes: "",
      discount_percent: "",
      isNewArrival: false,
      isBestSeller: false,
      isHomeFeatured: false,
      precio_mayorista: "",
      files: [],
      uploading: false,
      progress: "",
    });
    setAdminModal("bulk");
  }

  function closeAdminModal() {
    if (bulkUpload.uploading) return;
    setAdminModal(null);
    setEditingProduct(null);
  }

  async function closeAdminSession() {
    try {
      await signOutAdmin();
    } catch (error) {
      console.error("No fue posible cerrar la sesión administrativa:", error);
    } finally {
      setShowAdmin(false);
      setShowAdminLogin(false);
      setAdminModal(null);
      setEditingProduct(null);
    }
  }

  async function saveProduct() {
    let publicUrl = newProduct.image_url;

    if (!newProduct.name.trim()) {
      alert("Escribe el nombre del producto.");
      return;
    }

    if (!newProduct.precio_mayorista) {
      alert("Escribe el precio mayorista.");
      return;
    }

    if (!editingProduct && !newProduct.imageFile) {
      alert("Selecciona una imagen");
      return;
    }

    if (newProduct.imageFile) {
      const file = await compressImage(newProduct.imageFile);
      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        alert(uploadError.message);
        console.log(uploadError);
        return;
      }

      const {
        data: { publicUrl: uploadedUrl },
      } = supabase.storage.from("product-images").getPublicUrl(fileName);

      publicUrl = uploadedUrl;
    }

    let error;

    if (editingProduct) {
      const result = await supabase
        .from("products")
        .update({
          name: newProduct.name.trim().toUpperCase(),
          brand: newProduct.brand.trim().toUpperCase(),
          category: newProduct.category,
          sizes: newProduct.category === "Calzado" ? newProduct.sizes.trim().toUpperCase() : "",
          discount_percent: getDiscountPercent(newProduct.discount_percent),
          is_new_arrival: Boolean(newProduct.isNewArrival),
          is_best_seller: Boolean(newProduct.isBestSeller),
          is_home_featured: Boolean(newProduct.isHomeFeatured),
          wholesale_price: getCleanPrice(newProduct.precio_mayorista),
          shipping_factor: Number(newProduct.shipping_factor) || getDefaultShippingFactor(newProduct.category),
          image_url: publicUrl,
        })
        .eq("id", editingProduct.id);

      error = result.error;
    } else {
      const result = await supabase.from("products").insert([
        {
          name: newProduct.name.trim().toUpperCase(),
          brand: newProduct.brand.trim().toUpperCase(),
          category: newProduct.category,
          sizes: newProduct.category === "Calzado" ? newProduct.sizes.trim().toUpperCase() : "",
          discount_percent: getDiscountPercent(newProduct.discount_percent),
          is_new_arrival: Boolean(newProduct.isNewArrival),
          is_best_seller: Boolean(newProduct.isBestSeller),
          is_home_featured: Boolean(newProduct.isHomeFeatured),
          wholesale_price: getCleanPrice(newProduct.precio_mayorista),
          shipping_factor: Number(newProduct.shipping_factor) || getDefaultShippingFactor(newProduct.category),
          image_url: publicUrl,
        },
      ]);

      error = result.error;
    }

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    alert(editingProduct ? "Producto editado correctamente" : "Producto guardado correctamente");

    setNewProduct({
      name: "",
      brand: "",
      category: "Bolsas",
      sizes: "",
      discount_percent: "",
      isNewArrival: false,
      isBestSeller: false,
      isHomeFeatured: false,
      precio_mayorista: "",
      shipping_factor: "1",
      imageFile: null,
      image_url: "",
    });

    setEditingProduct(null);
    setAdminModal(null);
    fetchProducts();
  }

  async function saveBulkProducts() {
    const baseName = bulkUpload.baseName.trim().toUpperCase();
    const brand = bulkUpload.brand.trim().toUpperCase();
    const sizes = bulkUpload.category === "Calzado" ? bulkUpload.sizes.trim().toUpperCase() : "";
    const discountPercent = getDiscountPercent(bulkUpload.discount_percent);
    const isNewArrival = Boolean(bulkUpload.isNewArrival);
    const isBestSeller = Boolean(bulkUpload.isBestSeller);
    const isHomeFeatured = Boolean(bulkUpload.isHomeFeatured);
    const price = getCleanPrice(bulkUpload.precio_mayorista);
    const files = Array.from(bulkUpload.files || []);

    if (!baseName) {
      alert("Escribe el código o nombre base del modelo.");
      return;
    }

    if (!price) {
      alert("Escribe el precio mayorista general.");
      return;
    }

    if (!files.length) {
      alert("Selecciona una o varias imágenes.");
      return;
    }

    const confirmUpload = confirm(
      `Se crearán ${files.length} productos como ${baseName} 1, ${baseName} 2, ${baseName} 3... ¿Continuar?`
    );

    if (!confirmUpload) return;

    setBulkUpload((prev) => ({ ...prev, uploading: true, progress: `Preparando 0 de ${files.length}` }));

    for (let i = 0; i < files.length; i++) {
      const originalFile = files[i];
      const productName = `${baseName} ${i + 1}`;

      setBulkUpload((prev) => ({
        ...prev,
        progress: `Subiendo ${i + 1} de ${files.length}: ${productName}`,
      }));

      const file = await compressImage(originalFile);
      const safeName = productName.replace(/\s+/g, "-").toLowerCase();
      const fileName = `${Date.now()}-${i + 1}-${safeName}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        alert(`Error subiendo ${productName}: ${uploadError.message}`);
        console.log(uploadError);
        setBulkUpload((prev) => ({ ...prev, uploading: false }));
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("products").insert([
        {
          name: productName,
          brand,
          category: bulkUpload.category,
          sizes,
          discount_percent: discountPercent,
          is_new_arrival: isNewArrival,
          is_best_seller: isBestSeller,
          is_home_featured: isHomeFeatured,
          wholesale_price: price,
          shipping_factor: getDefaultShippingFactor(bulkUpload.category),
          image_url: publicUrl,
        },
      ]);

      if (insertError) {
        alert(`Error guardando ${productName}: ${insertError.message}`);
        console.log(insertError);
        setBulkUpload((prev) => ({ ...prev, uploading: false }));
        return;
      }
    }

    alert("Carga masiva terminada correctamente");
    setBulkUpload({
      baseName: "",
      brand: "",
      category: "Bolsas",
      sizes: "",
      discount_percent: "",
      isNewArrival: false,
      isBestSeller: false,
      isHomeFeatured: false,
      precio_mayorista: "",
      files: [],
      uploading: false,
      progress: "",
    });
    setAdminModal(null);
    fetchProducts();
  }

  async function submitReview() {
    if (!reviewForm.name.trim()) {
      alert("Escribe tu nombre para enviar la reseña.");
      return;
    }

    if (!reviewForm.comment.trim()) {
      alert("Escribe tu reseña.");
      return;
    }

    setReviewSubmitting(true);
    let mediaUrl = "";
    let mediaType = "";

    try {
      if (reviewForm.mediaFile) {
        let fileToUpload = reviewForm.mediaFile;
        if (reviewForm.mediaFile.type?.startsWith("image/")) {
          fileToUpload = await compressImage(reviewForm.mediaFile, 1400, 0.82);
        }

        mediaType = fileToUpload.type?.startsWith("video/") ? "video" : "image";
        const extension = mediaType === "video" ? (fileToUpload.name.split(".").pop() || "mp4") : "jpg";
        const fileName = `${Date.now()}-review.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("review-media")
          .upload(fileName, fileToUpload, {
            contentType: fileToUpload.type || (mediaType === "video" ? "video/mp4" : "image/jpeg"),
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("review-media").getPublicUrl(fileName);

        mediaUrl = publicUrl;
      }

      const { error } = await supabase.from("reviews").insert([
        {
          customer_name: reviewForm.name.trim(),
          rating: Number(reviewForm.rating) || 5,
          comment: reviewForm.comment.trim(),
          media_url: mediaUrl,
          media_type: mediaType,
          approved: false,
        },
      ]);

      if (error) throw error;

      alert("✅ Gracias, tu reseña fue enviada correctamente.");
      setReviewForm({ name: "", rating: "5", comment: "", mediaFile: null });
    } catch (error) {
      alert(error.message || "No se pudo enviar la reseña. Intenta de nuevo.");
      console.log(error);
    } finally {
      setReviewSubmitting(false);
      fetchReviews();
    }
  }

  async function approveReview(id) {
    const { error } = await supabase.from("reviews").update({ approved: true }).eq("id", id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    fetchReviews();
  }

  async function deleteReview(id) {
    const confirmDelete = confirm("¿Seguro que quieres eliminar esta reseña?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("reviews").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    fetchReviews();
  }

  async function uploadHomeMedia(file, currentUrl) {
    if (!file) return currentUrl || "";

    const compressedFile = await compressImage(file, 1600, 0.84);
    const fileName = `${Date.now()}-home-${compressedFile.name.replace(/\s+/g, "-")}`;

    const { error: uploadError } = await supabase.storage
      .from("home-media")
      .upload(fileName, compressedFile, {
        contentType: compressedFile.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("home-media").getPublicUrl(fileName);

    return publicUrl;
  }

  async function saveHomeSettings() {
    setHomeForm((prev) => ({ ...prev, saving: true }));

    try {
      const heroImageUrl = await uploadHomeMedia(homeForm.heroFile, homeSettings.hero_image_url);
      const newArrivalsImageUrl = await uploadHomeMedia(homeForm.newArrivalsFile, homeSettings.new_arrivals_image_url);
      const bestSellersImageUrl = await uploadHomeMedia(homeForm.bestSellersFile, homeSettings.best_sellers_image_url);

      const nextSettings = {
        id: 1,
        hero_image_url: heroImageUrl,
        new_arrivals_image_url: newArrivalsImageUrl,
        best_sellers_image_url: bestSellersImageUrl,
        hero_title: homeSettings.hero_title || DEFAULT_HOME_SETTINGS.hero_title,
        hero_subtitle: homeSettings.hero_subtitle || DEFAULT_HOME_SETTINGS.hero_subtitle,
        new_arrivals_title: homeSettings.new_arrivals_title || DEFAULT_HOME_SETTINGS.new_arrivals_title,
        new_arrivals_subtitle: homeSettings.new_arrivals_subtitle || DEFAULT_HOME_SETTINGS.new_arrivals_subtitle,
        best_sellers_title: homeSettings.best_sellers_title || DEFAULT_HOME_SETTINGS.best_sellers_title,
        best_sellers_subtitle: homeSettings.best_sellers_subtitle || DEFAULT_HOME_SETTINGS.best_sellers_subtitle,
        show_install_banner: Boolean(homeSettings.show_install_banner),
        install_banner_title: homeSettings.install_banner_title || DEFAULT_HOME_SETTINGS.install_banner_title,
        install_banner_subtitle: homeSettings.install_banner_subtitle || DEFAULT_HOME_SETTINGS.install_banner_subtitle,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("home_settings")
        .upsert(nextSettings, { onConflict: "id" });

      if (error) throw error;

      setHomeSettings((prev) => ({ ...prev, ...nextSettings }));
      setHomeForm({ heroFile: null, newArrivalsFile: null, bestSellersFile: null, saving: false });
      alert("Pantalla principal actualizada correctamente");
    } catch (error) {
      alert(error.message || "No se pudieron guardar los cambios del home.");
      console.log(error);
      setHomeForm((prev) => ({ ...prev, saving: false }));
    }
  }

  async function saveShowroomArrival() {
    if (!showroomForm.imageFile) {
      alert("Selecciona una imagen para el showroom.");
      return;
    }

    setShowroomForm((prev) => ({ ...prev, uploading: true }));

    try {
      const file = await compressImage(showroomForm.imageFile, 1600, 0.84);
      const fileName = `${Date.now()}-showroom.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("showroom-media")
        .upload(fileName, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("showroom-media").getPublicUrl(fileName);

      const { error } = await supabase.from("showroom_arrivals").insert([
        {
          title: "SHOWROOM",
          codes: "",
          description: "",
          image_url: publicUrl,
        },
      ]);

      if (error) throw error;

      alert("Imagen de showroom guardada correctamente");
      setShowroomForm({
        imageFile: null,
        uploading: false,
      });
      setAdminModal(null);
      fetchShowroomArrivals();
    } catch (error) {
      alert(error.message || "No se pudo guardar la imagen del showroom.");
      console.log(error);
      setShowroomForm((prev) => ({ ...prev, uploading: false }));
    }
  }

  async function deleteShowroomArrival(id) {
    const confirmDelete = confirm("¿Seguro que quieres eliminar este showroom?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("showroom_arrivals").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    fetchShowroomArrivals();
  }

  async function updateProductFlag(product, field, nextValue, successMessage) {
    if (!product?.id) {
      alert("No se pudo identificar el producto.");
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({ [field]: nextValue })
      .eq("id", product.id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    setProducts((prevProducts) =>
      prevProducts.map((item) => {
        if (item.id !== product.id) return item;

        if (field === "is_new_arrival") return { ...item, isNewArrival: nextValue, is_new_arrival: nextValue };
        if (field === "is_best_seller") return { ...item, isBestSeller: nextValue, is_best_seller: nextValue };
        if (field === "is_home_featured") return { ...item, isHomeFeatured: nextValue, is_home_featured: nextValue };

        return item;
      })
    );

    setSelectedProductGroup((prevGroup) => {
      if (!prevGroup?.variants?.length) return prevGroup;

      return {
        ...prevGroup,
        variants: prevGroup.variants.map((variant) => {
          if (variant.id !== product.id) return variant;

          if (field === "is_new_arrival") return { ...variant, isNewArrival: nextValue, is_new_arrival: nextValue };
          if (field === "is_best_seller") return { ...variant, isBestSeller: nextValue, is_best_seller: nextValue };
          if (field === "is_home_featured") return { ...variant, isHomeFeatured: nextValue, is_home_featured: nextValue };

          return variant;
        }),
      };
    });

    showToast(successMessage);
  }

  async function toggleNewArrival(product) {
    const nextValue = !Boolean(product?.isNewArrival || product?.is_new_arrival);
    await updateProductFlag(
      product,
      "is_new_arrival",
      nextValue,
      nextValue ? "Producto marcado como novedad ✅" : "Producto quitado de novedades"
    );
  }

  async function toggleBestSeller(product) {
    const nextValue = !Boolean(product?.isBestSeller || product?.is_best_seller);
    await updateProductFlag(
      product,
      "is_best_seller",
      nextValue,
      nextValue ? "Producto marcado como más vendido ✅" : "Producto quitado de más vendidos"
    );
  }

  async function toggleHomeFeatured(product) {
    const nextValue = !Boolean(product?.isHomeFeatured || product?.is_home_featured);
    await updateProductFlag(
      product,
      "is_home_featured",
      nextValue,
      nextValue ? "Producto marcado como destacado ✅" : "Producto quitado de destacados"
    );
  }

  function openMercadoPagoModal() {
    if (!cart.length) {
      alert("Tu carrito está vacío.");
      return;
    }

    if (cart.length < MERCADO_PAGO_MINIMUM_ITEMS) {
      alert(`Pedido mínimo para Mercado Pago: ${MERCADO_PAGO_MINIMUM_ITEMS} pieza${MERCADO_PAGO_MINIMUM_ITEMS === 1 ? "" : "s"}.`);
      return;
    }

    if (needsShippingQuote) {
      alert("Este pedido necesita cotización especial de envío. Envíalo por WhatsApp para confirmar el total.");
      return;
    }

    if (total < MERCADO_PAGO_MINIMUM_AMOUNT) {
      alert(`Monto mínimo para Mercado Pago: $${MERCADO_PAGO_MINIMUM_AMOUNT} MXN.`);
      return;
    }

    trackEvent("mercado_pago_click", {
      items: cart.length,
      value: total,
      currency: "MXN",
      test_mode: MERCADO_PAGO_TEST_MODE,
    });

    setCheckoutForm({ name: "", phone: "" });
    setCheckoutModalOpen(true);
  }

  function closeCheckoutModal() {
    if (checkoutLoading) return;
    setCheckoutModalOpen(false);
  }

  async function startMercadoPagoCheckout() {
    const customerName = checkoutForm.name.trim();
    const customerPhone = checkoutForm.phone.replace(/\D/g, "");

    if (!customerName) {
      alert("Escribe tu nombre.");
      return;
    }

    if (customerPhone.length < 10) {
      alert("Escribe un WhatsApp válido con lada.");
      return;
    }

    if (!cart.length || cart.length < MERCADO_PAGO_MINIMUM_ITEMS || needsShippingQuote || total < MERCADO_PAGO_MINIMUM_AMOUNT) {
      alert(`No se puede procesar este pedido. El monto mínimo para Mercado Pago es $${MERCADO_PAGO_MINIMUM_AMOUNT} MXN.`);
      return;
    }

    setCheckoutLoading(true);

    try {
      const orderPayload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        subtotal,
        shipping_units: shippingUnits,
        shipping_cost: shippingCost || 0,
        service_fee: serviceFee,
        volume_discount: volumeDiscount,
        total,
        payment_method: "mercadopago",
        payment_status: "pending",
        order_status: "pending",
      };

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select("id")
        .single();

      if (orderError) throw orderError;

      sendTelegramOrderNotification(
        {
          id: orderData.id,
          ...orderPayload,
          created_at: new Date().toISOString(),
        },
        "🛍️ Nuevo pedido creado"
      );

      await supabase.from("customers").insert([
        {
          name: customerName,
          phone: customerPhone,
          total_orders: 0,
          total_spent: 0,
          last_order_date: new Date().toISOString(),
        },
      ]);

      const preferenceResponse = await fetch("/api/create-preference", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: orderData.id,
          total,
          items: getCartSummary(cart).map((item) => ({
            name: item.modelCode || item.name,
            color: item.variantColor || "",
            brand: item.brand || "",
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      });

      const preferenceData = await preferenceResponse.json();

      if (!preferenceResponse.ok || !preferenceData.init_point) {
        console.log(preferenceData);
        await supabase
          .from("orders")
          .update({ payment_status: "rejected", order_status: "cancelled", status: "cancelled" })
          .eq("id", orderData.id);
        throw new Error("No se pudo generar el link de pago.");
      }

      trackEvent("begin_checkout", {
        items: cart.length,
        subtotal,
        discount: volumeDiscount,
        shipping_units: shippingUnits,
        shipping_cost: shippingCost || 0,
        service_fee: serviceFee,
        value: total,
        currency: "MXN",
        payment_method: "mercadopago",
      });

      localStorage.setItem(
        MP_PENDING_ORDER_KEY,
        JSON.stringify({
          orderId: orderData.id,
          customerName,
          customerPhone,
          total,
          items: cart.length,
          createdAt: new Date().toISOString(),
        })
      );

      window.location.assign(preferenceData.init_point);
    } catch (error) {
      console.log(error);
      alert(error.message || "No se pudo iniciar el pago. Intenta de nuevo.");
      setCheckoutLoading(false);
    }
  }

  function openAdvisorOrderModal() {
    if (cart.length < 6) {
      alert("Pedido mínimo: 6 piezas.");
      return;
    }

    setAdvisorOrderForm({ name: "", phone: "" });
    setAdvisorOrderModalOpen(true);
  }

  function closeAdvisorOrderModal() {
    if (advisorOrderLoading) return;
    setAdvisorOrderModalOpen(false);
  }

  async function submitAdvisorOrder() {
    const customerName = advisorOrderForm.name.trim();
    const customerPhone = advisorOrderForm.phone.trim();

    if (!customerName) {
      alert("Escribe tu nombre.");
      return;
    }

    if (!customerPhone) {
      alert("Escribe tu teléfono.");
      return;
    }

    if (!cart.length) {
      alert("Tu carrito está vacío.");
      return;
    }

    setAdvisorOrderLoading(true);

    try {
      const items = getCartSummary(cart).map((item) => ({
        code: item.modelCode || getProductInfo(item).code || item.name,
        name: item.name || item.modelCode || "Producto",
        color: item.variantColor || "",
        size: item.selectedSize || "",
        quantity: item.quantity,
        unitPrice: getCleanPrice(item.price),
      }));

      console.log("ETAPA 1 - Submit pedido asesor:", {
        customerName,
        customerPhone: customerPhone.replace(/\d(?=\d{4})/g, "•"),
        itemCount: items.length,
        totalPieces: items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        volumeDiscount,
        shippingCost: shippingCost || 0,
        needsShippingQuote,
        total,
      });

      console.log("ETAPA 2 - Fetch /api/send-advisor-order iniciado");
      const response = await fetch("/api/send-advisor-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          items,
          subtotal,
          volumeDiscount,
          shippingCost: shippingCost || 0,
          needsShippingQuote,
          total,
        }),
      });
      const responseText = await response.text();
      let result = null;

      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        console.error("ERROR ETAPA 2 - Respuesta no es JSON:", {
          parseError,
          status: response.status,
          contentType: response.headers.get("content-type"),
          responsePreview: responseText.slice(0, 300),
        });
      }

      console.log("ETAPA 2 - Respuesta /api/send-advisor-order:", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        data: result,
      });

      if (!response.ok || result?.ok !== true) {
        const endpointMessage =
          result?.error ||
          `El endpoint respondió ${response.status} ${response.statusText || ""}`.trim();
        throw new Error(endpointMessage);
      }

      trackEvent("send_advisor_order", {
        items: cart.length,
        value: total,
        currency: "MXN",
      });

      setAdvisorOrderModalOpen(false);
      setAdvisorOrderForm({ name: "", phone: "" });
      setCart([]);
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(ORDER_SENT_KEY);
      localStorage.removeItem(LAST_ADVISOR_KEY);
      alert(
        "✅ Tu pedido fue enviado correctamente.\nEn unos momentos un asesor de V & A Style te contactará por WhatsApp."
      );
    } catch (error) {
      console.error("ERROR ETAPA 1 - Submit pedido asesor:", error);
      alert(error?.message || "No se pudo enviar el pedido. Intenta nuevamente.");
    } finally {
      setAdvisorOrderLoading(false);
    }
  }

  function getFavoriteKey(group) {
    return group?.id || group?.code || group?.name || "";
  }

  function isFavoriteGroup(group) {
    return favorites.includes(getFavoriteKey(group));
  }

  function toggleFavoriteGroup(group) {
    const key = getFavoriteKey(group);
    if (!key) return;

    const nextActive = !favorites.includes(key);

    setFavorites((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );

    trackEvent("toggle_favorite", {
      item_id: group.code || group.name,
      active: nextActive,
    });
  }

  function selectCategory(nextCategory) {
    setSearchTerm("");
    setCategory(nextCategory);
    setCurrentView("home");
    setCurrentPage(1);
    setShowCategorySheet(false);
    scrollToCatalog();
  }

  function openHomeView() {
    setSearchTerm("");
    setCategory("Todas");
    setCurrentView("home");
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openNewArrivalsView() {
    setSearchTerm("");
    setCategory("Todas");
    setCurrentView("novedades");
    setSortOrder("recent");
    setCurrentPage(1);
    scrollToCatalog();
  }

  function openBestSellersView() {
    setSearchTerm("");
    setCategory("Todas");
    setCurrentView("masVendidos");
    setSortOrder("az");
    setCurrentPage(1);
    scrollToCatalog();
  }

  function openFavoritesView() {
    setSearchTerm("");
    setCategory("Todas");
    setCurrentView("favoritos");
    setCurrentPage(1);
    scrollToCatalog();
  }

  function scrollToReviews() {
    reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToCatalog() {
    setTimeout(() => {
      catalogRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function scrollToCart() {
    const cartElement = cartRef.current;
    if (!cartElement || typeof window === "undefined") return;

    const rect = cartElement.getBoundingClientRect();
    const targetTop = Math.max(
      0,
      window.scrollY + rect.top - (window.innerHeight - Math.min(rect.height, window.innerHeight * 0.82)) / 2
    );

    window.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }

  function openLink(url) {
    window.location.assign(url);
  }

  if (showCommunity) {
    return (
      <CommunityFeed
        onBackToStore={() => {
          setShowCommunity(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  return (
    <div className="page">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }

        .page {
          min-height: 100vh;
          background: #fffaf7;
          color: #2f2927;
          font-family: Arial, sans-serif;
        }

        .navbar {
          height: auto;
          background: rgba(255,255,255,.94);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 22px;
          border-bottom: 1px solid #f1ded6;
          position: sticky;
          top: 0;
          z-index: 20;
          box-shadow: 0 8px 24px rgba(80,40,30,.06);
        }

        .logo-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .menu {
          display: flex;
          gap: 36px;
          font-weight: 700;
        }

        .menu span {
          cursor: pointer;
          color: #6e5048;
        }

        .menu span:first-child {
          color: #c94462;
          border-bottom: 3px solid #c94462;
          padding-bottom: 12px;
        }

        .nav-actions {
          display: flex;
          gap: 14px;
        }

        button {
          border: none;
          cursor: pointer;
          font-weight: 700;
        }

        .cart-btn,
        .pink-btn {
          padding: 14px 22px;
          border-radius: 7px;
          font-size: 15px;
        }

        .pink-btn {
          background: #c94462;
          color: white;
        }

        .cart-btn {
          background: white;
          border: 1px solid #caa27b;
          color: #8b633e;
        }

        .hero {
          text-align: center;
          padding: 24px 14px 18px;
          background: radial-gradient(circle at top, #fff7ef 0%, #ffe0dc 45%, #fff3e8 100%);
          border-bottom: 1px solid #f1d7cb;
        }

        .hero h1 {
          font-family: Georgia, serif;
          font-size: 48px;
          font-weight: 700;
          margin: 0;
          color: #a72f4d;
          letter-spacing: .2px;
          text-shadow: 0 8px 22px rgba(167,47,77,.16);
        }

        .hero p {
          margin: 11px auto 0;
          max-width: 760px;
          font-size: 20px;
          line-height: 1.45;
          color: #6b403e;
          font-weight: 800;
        }

        .main {
          display: grid;
          grid-template-columns: 1fr 330px;
          gap: 34px;
          padding: 24px 38px 92px;
        }

        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 13px;
          margin-bottom: 16px;
        }

        .catalog-tools {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 22px;
        }

        .search-input {
          flex: 1;
          background: white;
          border: 1px solid #eadad2;
          color: #5f4943;
          border-radius: 999px;
          padding: 14px 18px;
          font-size: 15px;
          font-weight: 700;
          box-shadow: 0 5px 12px rgba(0,0,0,.04);
          outline: none;
        }

        .search-input:focus {
          border-color: #c94462;
          box-shadow: 0 0 0 3px rgba(201,68,98,.10);
        }

        .results-count {
          color: #7a5c50;
          font-size: 13px;
          font-weight: 900;
          white-space: nowrap;
        }

        .sort-select {
          background: transparent;
          border: 1px solid #eadbd3;
          color: #7a5c50;
          border-radius: 999px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 800;
          outline: none;
          opacity: .78;
        }

        .size-select {
          width: 100%;
          background: #fffaf7;
          border: 1px solid #eadbd3;
          color: #7a4050;
          border-radius: 8px;
          padding: 7px 8px;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 5px;
          outline: none;
        }

        .shipping-note {
          background: #fff4ea;
          border: 2px solid #c94462;
          border-radius: 12px;
          padding: 11px 12px;
          color: #7a4050;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.35;
          margin: 12px 0;
          text-align: center;
        }

        .filter {
          background: white;
          border: 1px solid #eadad2;
          color: #7c5d55;
          border-radius: 12px;
          padding: 12px 20px;
          box-shadow: 0 5px 12px rgba(0,0,0,.04);
        }

        .filter.active {
          background: #c94462;
          color: white;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(160px, 1fr));
          gap: 22px;
        }

        .card {
          position: relative;
          background: white;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 8px 22px rgba(90,50,30,.12);
          border: 1px solid #f1e4dd;
        }

        .card img {
          width: 100%;
          height: 185px;
          object-fit: contain;
          background: #fffaf7;
          display: block;
          cursor: zoom-in;
          -webkit-touch-callout: default;
        }

        .card-body {
          padding: 7px 10px 9px;
        }

        .card-body h3 {
          margin: 0 0 2px;
          font-size: 14px;
          line-height: 1.15;
        }

        .brand {
          color: #7a5c50;
          font-size: 12px;
          font-weight: 900;
          margin: 0 0 3px;
          letter-spacing: .3px;
          line-height: 1.1;
        }

        .price {
          color: #c94462;
          font-weight: 900;
          margin-bottom: 6px;
          font-size: 14px;
        }

        .price-block {
          margin-bottom: 6px;
          line-height: 1.1;
        }

        .old-price {
          display: inline-block;
          color: #8f827c;
          font-size: 12px;
          font-weight: 800;
          text-decoration-line: line-through;
          text-decoration-color: #c94462;
          text-decoration-thickness: 2px;
          margin-right: 6px;
        }

        .sale-price {
          color: #c94462;
          font-size: 15px;
          font-weight: 950;
        }

        .discount-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #c94462;
          color: white;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 12px;
          font-weight: 950;
          box-shadow: 0 6px 14px rgba(0,0,0,.16);
          z-index: 2;
        }

        .discount-row,
        .subtotal-row {
          font-size: 14px;
          font-weight: 900;
          color: #7a4050;
          margin: 6px 0;
        }

        .discount-row {
          color: #c94462;
        }

        .add {
          width: 100%;
          background: #c94462;
          color: white;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.1;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 26px 0 0;
          flex-wrap: wrap;
        }

        .page-btn {
          background: #c94462;
          color: white;
          padding: 12px 18px;
          border-radius: 999px;
          font-size: 14px;
        }

        .page-btn:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .page-info {
          background: white;
          border: 1px solid #eadbd3;
          color: #7a4050;
          padding: 11px 16px;
          border-radius: 999px;
          font-weight: 900;
          font-size: 14px;
          box-shadow: 0 5px 12px rgba(0,0,0,.04);
        }

        .empty-results {
          background: white;
          border: 1px solid #eadbd3;
          color: #7a4050;
          padding: 22px;
          border-radius: 14px;
          text-align: center;
          font-weight: 900;
          box-shadow: 0 8px 22px rgba(90,50,30,.08);
        }

        .new-arrivals-section {
          margin: 16px 38px 0;
          background: white;
          border: 1px solid #eadbd3;
          border-radius: 18px;
          padding: 14px 18px 12px;
          box-shadow: 0 8px 26px rgba(90,50,30,.10);
        }

        .reviews-section {
          margin: 22px 38px 0;
          background: white;
          border: 1px solid #eadbd3;
          border-radius: 18px;
          padding: 20px 20px 170px;
          box-shadow: 0 8px 26px rgba(90,50,30,.10);
        }

        .section-title-wrap {
          text-align: center;
          margin-bottom: 16px;
        }

        .new-arrivals-section .section-title-wrap {
          margin-bottom: 9px;
        }

        .section-title-wrap h2 {
          margin: 0;
          color: #7a4050;
          font-family: Georgia, serif;
          font-size: 28px;
        }

        .section-title-wrap p {
          margin: 8px auto 0;
          color: #6b403e;
          font-weight: 800;
          font-size: 14px;
        }

        .new-arrivals-grid {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 0 28px 2px 2px;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
        }

        .new-arrivals-grid::-webkit-scrollbar {
          height: 6px;
        }

        .new-arrivals-grid::-webkit-scrollbar-thumb {
          background: rgba(201,68,98,.28);
          border-radius: 999px;
        }

        .arrival-card {
          flex: 0 0 24%;
          border-radius: 14px;
          overflow: hidden;
          padding: 0;
          scroll-snap-align: start;
          background: transparent;
          border: none;
          box-shadow: none;
        }

        .arrival-card img {
          width: 100%;
          aspect-ratio: 4 / 3;
          height: auto;
          object-fit: cover;
          display: block;
          background: transparent;
          border-radius: 14px;
          cursor: zoom-in;
        }

        .reviews-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 18px;
        }

        .review-card,
        .review-form-card,
        .admin-review-item {
          background: #fffaf7;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          padding: 15px;
          box-shadow: 0 7px 18px rgba(90,50,30,.08);
        }

        .review-stars {
          font-size: 16px;
          margin-bottom: 8px;
        }

        .review-card p,
        .admin-review-item p {
          color: #5f4943;
          font-weight: 700;
          line-height: 1.45;
        }

        .review-media {
          width: 100%;
          max-height: 260px;
          object-fit: contain;
          border-radius: 12px;
          margin-top: 10px;
          background: #fff4ea;
        }

        .review-form-card {
          max-width: 620px;
          margin: 0 auto;
        }

        .review-form-card h3 {
          margin: 0 0 12px;
          color: #7a4050;
          text-align: center;
          font-family: Georgia, serif;
        }

        .review-form-card input,
        .review-form-card select,
        .review-form-card textarea {
          width: 100%;
          padding: 13px;
          border-radius: 10px;
          border: 1px solid #eadbd3;
          margin: 8px 0;
          font-size: 14px;
          font-family: Arial, sans-serif;
        }

        .review-form-card textarea {
          min-height: 92px;
          resize: vertical;
        }

        .admin-check {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff4ea;
          border: 1px solid #eadbd3;
          border-radius: 12px;
          padding: 12px;
          color: #7a4050;
          font-size: 14px;
          font-weight: 900;
          margin: 10px 0;
        }

        .admin-check input {
          width: auto !important;
          margin: 0 !important;
        }

        .orders-header-note {
          background: #fff4ea;
          border: 1px solid #eadbd3;
          border-radius: 12px;
          padding: 12px;
          color: #7a4050;
          font-weight: 900;
          text-align: center;
          margin-bottom: 12px;
        }

        .new-order-notice {
          background: #eaf8ef;
          border: 1px solid #b9dfc7;
          color: #285f38;
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .order-card {
          background: #fffaf7;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 7px 18px rgba(90,50,30,.08);
        }

        .order-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .order-card strong {
          color: #2f2927;
          font-size: 15px;
        }

        .order-id {
          color: #7a5c50;
          font-size: 11px;
          font-weight: 900;
          word-break: break-all;
        }

        .order-total {
          color: #c94462;
          font-size: 18px;
          font-weight: 950;
          white-space: nowrap;
        }

        .order-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin: 10px 0;
        }

        .order-field {
          background: white;
          border: 1px solid #f1e4dd;
          border-radius: 10px;
          padding: 9px;
          color: #5f4943;
          font-size: 12px;
          font-weight: 800;
        }

        .order-field span {
          display: block;
          color: #9b7568;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          margin-bottom: 3px;
        }

        .order-status-select {
          width: 100%;
          background: white;
          border: 1px solid #eadbd3;
          color: #7a4050;
          border-radius: 10px;
          padding: 11px;
          font-size: 14px;
          font-weight: 900;
          outline: none;
        }

        .admin-review-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .side {
          display: flex;
          flex-direction: column;
          gap: 32px;
          scroll-margin-top: 96px;
        }

        .box {
          background: white;
          border-radius: 10px;
          border: 1px solid #eadbd3;
          box-shadow: 0 8px 26px rgba(90,50,30,.12);
          overflow: hidden;
        }

        .box-header {
          padding: 18px;
          border-bottom: 1px solid #eadbd3;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 800;
          font-size: 18px;
        }

        .cart-content {
          min-height: 240px;
          padding: 18px;
          text-align: center;
          color: #6f625f;
        }

        .cart-items-scroll {
          max-height: 235px;
          overflow-y: auto;
          padding-right: 6px;
          margin-bottom: 12px;
          -webkit-overflow-scrolling: touch;
        }

        .cart-item {
          text-align: left;
          padding: 8px 0;
          border-bottom: 1px solid #f1e5df;
          font-size: 13px;
          line-height: 1.25;
          color: #4f403b;
          font-weight: 800;
        }

        .cart-item-price {
          color: #c94462;
          font-weight: 950;
          margin-top: 3px;
        }

        .cart-total {
          margin: 14px 0 12px;
          padding: 14px 12px;
          background: #fff4ea;
          border: 1px solid #eadbd3;
          border-radius: 12px;
          color: #7a4050;
          font-size: 20px;
          font-weight: 900;
          text-align: center;
          box-shadow: 0 6px 16px rgba(90,50,30,.08);
        }

        .minimum-order {
          background: #fff4ea;
          border: 1px solid #eadbd3;
          border-radius: 10px;
          padding: 10px;
          font-size: 14px;
          color: #9b4f5d;
          font-weight: 900;
          margin-top: 8px;
        }

        .whatsapp-order-btn {
          width: 100%;
          background: #25D366;
          color: white;
          padding: 15px 16px;
          border-radius: 999px;
          font-size: 16px;
          font-weight: 950;
          margin: 6px 0 10px;
          box-shadow: 0 8px 18px rgba(37, 211, 102, .24);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .whatsapp-order-btn svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }

        .whatsapp-order-btn:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .mercadopago-btn {
          width: 100%;
          background: #009ee3;
          color: white;
          padding: 13px 14px;
          border-radius: 999px;
          font-size: 15px;
          margin: 4px 0 10px;
          box-shadow: 0 8px 16px rgba(0, 158, 227, .18);
        }

        .mercadopago-btn:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .checkout-modal {
          width: min(440px, 100%);
          background: white;
          border-radius: 18px;
          border: 1px solid #eadbd3;
          box-shadow: 0 18px 45px rgba(0,0,0,.25);
          padding: 20px;
        }

        .checkout-modal h3 {
          margin: 0 0 8px;
          color: #7a4050;
          font-family: Georgia, serif;
          font-size: 24px;
          text-align: center;
        }

        .checkout-modal p {
          margin: 0 0 14px;
          color: #6b403e;
          font-size: 14px;
          font-weight: 800;
          text-align: center;
          line-height: 1.4;
        }

        .checkout-modal input {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: 1px solid #eadbd3;
          margin: 8px 0;
          font-size: 15px;
          outline: none;
        }

        .checkout-modal input:focus {
          border-color: #c94462;
          box-shadow: 0 0 0 3px rgba(201,68,98,.10);
        }

        .checkout-total {
          margin: 12px 0;
          padding: 12px;
          border-radius: 12px;
          background: #fff4ea;
          color: #7a4050;
          font-size: 18px;
          font-weight: 950;
          text-align: center;
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 10px;
          margin-top: 12px;
        }

        .secondary-btn {
          background: #fff4ea;
          color: #7a4050;
          border: 1px solid #eadbd3;
          border-radius: 999px;
          padding: 13px 14px;
        }



        .admin-toolbar {
          margin: 18px 38px 0;
          background: white;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          padding: 14px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
          box-shadow: 0 8px 26px rgba(90,50,30,.10);
        }

        .admin-toolbar button {
          padding: 12px 16px;
          border-radius: 999px;
          background: #c94462;
          color: white;
          font-size: 14px;
        }

        .admin-toolbar .logout-btn {
          background: #2f2927;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.55);
          z-index: 2500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .admin-modal {
          width: min(520px, 100%);
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 18px;
          border: 1px solid #eadbd3;
          box-shadow: 0 18px 45px rgba(0,0,0,.25);
          padding: 20px;
        }

        .admin-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .admin-modal-header h3 {
          margin: 0;
          color: #7a4050;
          font-family: Georgia, serif;
          font-size: 24px;
        }

        .modal-close-btn {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: #fff4ea;
          color: #7a4050;
          font-size: 22px;
          font-weight: 900;
        }

        .admin-modal input,
        .admin-modal select {
          width: 100%;
          padding: 15px;
          border-radius: 9px;
          border: 1px solid #eadbd3;
          margin: 10px 0;
          font-size: 15px;
        }

        .bulk-note {
          background: #fff4ea;
          border: 1px solid #eadbd3;
          border-radius: 12px;
          padding: 12px;
          color: #6b403e;
          font-weight: 700;
          line-height: 1.45;
          font-size: 13px;
          margin: 8px 0 12px;
        }

        .bulk-progress {
          margin-top: 12px;
          background: #f7ebe6;
          border-radius: 12px;
          padding: 12px;
          color: #7a4050;
          font-weight: 900;
          text-align: center;
        }


        .admin-box {
          padding: 18px;
        }

        .admin-box input,
        .admin-box select {
          width: 100%;
          padding: 15px;
          border-radius: 7px;
          border: 1px solid #eadbd3;
          margin: 12px 0;
          font-size: 15px;
        }

        .info-section {
          margin: 0 38px 92px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .info-card {
          background: white;
          border: 1px solid #eadbd3;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 26px rgba(90,50,30,.10);
        }

        .info-card h2 {
          margin: 0 0 14px;
          color: #7a4050;
          font-family: Georgia, serif;
          font-weight: 500;
        }

        .info-card p {
          color: #5f4943;
          line-height: 1.55;
          margin: 10px 0;
          font-weight: 600;
        }

        .trust-list {
          margin: 14px 0 0;
          padding-left: 18px;
          color: #5f4943;
          line-height: 1.7;
          font-weight: 600;
        }

        .contact-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }

        .contact-btn {
          background: #c94462;
          color: white;
          padding: 13px 14px;
          border-radius: 999px;
          text-align: center;
          font-weight: 800;
          box-shadow: 0 6px 16px rgba(120,70,60,.13);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .contact-btn svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
          flex: 0 0 auto;
        }

        .whatsapp-btn {
          background: #25D366;
          color: white;
        }

        .facebook-btn {
          background: #1877F2;
          color: white;
        }

        .instagram-btn {
          background: linear-gradient(135deg,#f58529,#dd2a7b,#8134af,#515bd4);
          color: white;
        }

        .tiktok-btn {
          background: #111111;
          color: white;
        }

        .footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #f4e1cd;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px 14px;
          color: #7a4050;
          font-size: 15px;
          font-weight: 900;
          text-align: center;
          border-top: 1px solid #e7cdb7;
          z-index: 50;
          box-shadow: 0 -8px 22px rgba(80,40,30,.07);
        }

        .admin-secret {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(215,101,120,.08);
          color: rgba(215,101,120,.18);
          border: none;
          font-size: 10px;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .delete-btn {
          background: #ff4d4d;
          color: white;
          padding: 10px;
          border-radius: 10px;
          margin-top: 10px;
          width: 100%;
        }

        .floating-cart {
          display: none;
        }


        .variant-count {
          position: absolute;
          left: 8px;
          top: 8px;
          background: rgba(255,255,255,.95);
          color: #7a4050;
          border: 1px solid #eadbd3;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 950;
          z-index: 2;
          box-shadow: 0 6px 14px rgba(0,0,0,.10);
        }

        .variants-modal-card {
          width: min(920px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          background: white;
          border-radius: 18px;
          border: 1px solid #eadbd3;
          box-shadow: 0 18px 45px rgba(0,0,0,.28);
          padding: 18px;
        }

        .variants-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 14px;
        }

        .variants-header h3 {
          margin: 0 0 4px;
          color: #7a4050;
          font-family: Georgia, serif;
          font-size: 26px;
        }

        .variants-header p {
          margin: 0;
          color: #6b403e;
          font-size: 14px;
          font-weight: 800;
        }

        .variants-scroll {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding: 4px 2px 12px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }

        .variant-card {
          min-width: 220px;
          max-width: 220px;
          background: #fffaf7;
          border: 1px solid #eadbd3;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(90,50,30,.10);
          scroll-snap-align: start;
        }

        .variant-card img {
          width: 100%;
          height: 230px;
          object-fit: contain;
          background: #fff4ea;
          display: block;
          cursor: zoom-in;
        }

        .variant-body {
          padding: 12px;
          text-align: center;
        }

        .variant-color {
          color: #2f2927;
          font-size: 16px;
          font-weight: 950;
          margin-bottom: 5px;
        }


        .variant-plus-btn {
          width: 100%;
          min-height: 50px;
          border-radius: 999px;
          background: #c94462;
          color: #fff;
          font-size: 28px;
          line-height: 1;
          font-weight: 950;
          box-shadow: 0 10px 20px rgba(201,68,98,.22);
          margin-top: 8px;
        }

        .variant-plus-btn:active {
          transform: scale(.98);
        }
        .qty-control {
          display: grid;
          grid-template-columns: 42px 1fr 42px;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
        }

        .qty-control button {
          height: 38px;
          border-radius: 999px;
          background: #c94462;
          color: white;
          font-size: 20px;
          line-height: 1;
        }

        .qty-control span {
          height: 38px;
          border-radius: 999px;
          border: 1px solid #eadbd3;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7a4050;
          font-weight: 950;
        }

        .variants-footer {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
          border-top: 1px solid #eadbd3;
          padding-top: 14px;
        }

        .toast {
          position: fixed;
          left: 50%;
          bottom: 76px;
          transform: translateX(-50%);
          background: #2f2927;
          color: white;
          padding: 12px 18px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 900;
          box-shadow: 0 10px 28px rgba(0,0,0,.22);
          z-index: 3000;
          white-space: nowrap;
        }

        .image-modal {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.88);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          overflow: hidden;
        }

        .image-modal-content {
          position: relative;
          z-index: 10000;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          touch-action: manipulation;
          cursor: grab;
        }

        .image-modal-img {
          max-width: 96vw;
          max-height: 84vh;
          object-fit: contain;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: transform .12s ease-out;
          cursor: zoom-in;
          -webkit-touch-callout: default;
        }

        .image-modal-title {
          position: fixed;
          z-index: 10001;
          left: 18px;
          bottom: 18px;
          right: 18px;
          color: white;
          text-align: center;
          font-weight: 800;
          font-size: 14px;
          text-shadow: 0 2px 8px rgba(0,0,0,.5);
          pointer-events: none;
        }

        .gallery-nav-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          width: 46px;
          height: 46px;
          border-radius: 999px;
          background: rgba(255,255,255,.92);
          color: #7a4050;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
          z-index: 10002;
          box-shadow: 0 8px 22px rgba(0,0,0,.25);
        }

        .gallery-nav-btn.left {
          left: 16px;
        }

        .gallery-nav-btn.right {
          right: 16px;
        }

        .image-counter {
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10002;
          background: rgba(255,255,255,.92);
          color: #7a4050;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 900;
          box-shadow: 0 8px 22px rgba(0,0,0,.20);
        }

        .close-modal {
          position: fixed;
          top: 16px;
          right: 16px;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: rgba(255,255,255,.95);
          color: #7a4050;
          font-size: 22px;
          font-weight: 900;
          z-index: 10002;
          box-shadow: 0 8px 22px rgba(0,0,0,.25);
        }

        @media (max-width: 768px) {
          .navbar {
            padding: 6px 10px 8px;
            flex-direction: column;
            gap: 4px;
          }

          .logo-wrap {
            width: 100%;
            justify-content: center;
            position: relative;
          }

          .logo-wrap .admin-secret {
            position: absolute;
            left: 6px;
            top: 10px;
          }

          .navbar img {
            height: 56px !important;
            margin-top: 0 !important;
          }

          .menu {
            width: 100%;
            gap: 18px;
            font-size: 13px;
            flex-wrap: wrap;
            justify-content: center;
          }

          .menu span:first-child {
            padding-bottom: 5px;
          }

          .nav-actions {
            width: 100%;
            justify-content: center;
          }

          .top-cart {
            display: none;
          }

          .hero {
            padding: 15px 10px 13px;
          }

          .hero h1 {
            font-size: 30px;
            line-height: 1.05;
          }

          .hero p {
            font-size: 15px;
            line-height: 1.3;
            margin-top: 8px;
          }

          .main {
            display: flex;
            flex-direction: column;
            padding: 11px 10px 90px;
            gap: 16px;
          }

          .filters {
            gap: 7px;
            margin-bottom: 10px;
          }

          .catalog-tools {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            margin-bottom: 12px;
          }

          .search-input {
            width: 100%;
            padding: 11px 14px;
            font-size: 13px;
          }

          .results-count {
            text-align: center;
            font-size: 12px;
          }

          .sort-select {
            align-self: center;
            font-size: 11px;
            padding: 7px 9px;
          }

          .size-select {
            font-size: 11px;
            padding: 6px 7px;
          }

          .shipping-note {
            font-size: 12px;
            padding: 10px;
          }

          .filter {
            padding: 8px 10px;
            font-size: 12px;
            border-radius: 10px;
          }

          .grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .card {
            border-radius: 12px;
          }

          .card img {
            height: 145px;
          }

          .card-body {
            padding: 5px 7px 7px;
          }

          .card-body h3 {
            font-size: 12.5px;
            margin: 0 0 2px;
            line-height: 1.12;
          }

          .brand {
            font-size: 11px;
            margin-bottom: 2px;
          }

          .price {
            font-size: 12.5px;
            margin-bottom: 4px;
          }

          .old-price {
            font-size: 10.5px;
          }

          .sale-price {
            font-size: 13px;
          }

          .discount-badge {
            top: 6px;
            right: 6px;
            font-size: 10.5px;
            padding: 5px 7px;
          }

          .add {
            font-size: 11.5px;
            padding: 7px 8px;
          }

          .pink-btn,
          .delete-btn {
            font-size: 12px;
            padding: 9px;
          }

          .pagination {
            gap: 8px;
            margin-top: 18px;
          }

          .page-btn {
            padding: 10px 13px;
            font-size: 12px;
          }

          .page-info {
            font-size: 12px;
            padding: 9px 12px;
          }

          .new-arrivals-section {
            margin: 10px 10px 0;
            padding: 11px 12px 10px;
            border-radius: 16px;
          }

          .reviews-section {
            margin: 14px 10px 0;
            padding: 15px 12px 190px;
            border-radius: 16px;
          }

          .section-title-wrap h2 {
            font-size: 23px;
          }

          .new-arrivals-section .section-title-wrap {
            margin-bottom: 8px;
          }

          .section-title-wrap p {
            font-size: 12px;
          }

          .new-arrivals-grid {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding: 0 34px 2px 2px;
          }

          .arrival-card {
            flex: 0 0 58%;
            border-radius: 12px;
          }

          .arrival-card img {
            aspect-ratio: 4 / 3;
            height: auto;
            object-fit: cover;
            border-radius: 12px;
          }

          .reviews-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .review-form-card input,
          .review-form-card select,
          .review-form-card textarea {
            font-size: 13px;
            padding: 11px;
          }

          .side {
            width: 100%;
            gap: 16px;
            scroll-margin-top: 84px;
          }

          .box {
            width: 100%;
          }

          .box-header {
            padding: 13px;
            font-size: 15px;
          }

          .cart-content {
            min-height: 150px;
            padding: 13px 12px;
          }

          .cart-items-scroll {
            max-height: 225px;
          }

          .cart-item {
            font-size: 12px;
            padding: 7px 0;
          }

          .cart-total {
            font-size: 18px;
            padding: 13px 10px;
          }

          .admin-toolbar {
            margin: 12px 10px 0;
            padding: 10px;
          }

          .admin-toolbar button {
            width: 100%;
            padding: 11px 12px;
            font-size: 13px;
          }

          .admin-modal {
            padding: 16px;
            border-radius: 16px;
          }

          .admin-modal-header h3 {
            font-size: 21px;
          }

          .admin-box {
            padding: 13px;
          }

          .info-section {
            margin: 0 10px 88px;
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .info-card {
            padding: 18px 16px;
            border-radius: 14px;
          }

          .info-card h2 {
            font-size: 24px;
          }

          .info-card p,
          .trust-list {
            font-size: 13px;
            font-weight: 600;
          }

          .contact-buttons {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .footer {
            font-size: 13px;
            padding: 9px 12px;
          }

          .floating-cart {
            display: flex;
            position: fixed;
            right: 16px;
            bottom: 52px;
            width: 62px;
            height: 62px;
            border-radius: 999px;
            background: #c94462;
            color: white;
            align-items: center;
            justify-content: center;
            gap: 4px;
            font-size: 18px;
            font-weight: 800;
            box-shadow: 0 8px 22px rgba(0,0,0,.24);
            z-index: 999;
          }


          .variants-modal-card {
            padding: 14px;
            border-radius: 16px;
          }

          .variants-header h3 {
            font-size: 22px;
          }

          .variant-card {
            min-width: 78vw;
            max-width: 78vw;
          }

          .variant-card img {
            height: 280px;
          }

          .variants-footer .pink-btn,
          .variants-footer .cart-btn {
            width: 100%;
          }

          .image-modal {
            padding: 8px;
          }

          .image-modal-img {
            max-width: 98vw;
            max-height: 82vh;
          }
        }

        /* === V&A Style app refresh === */
        .navbar { display: none; }

        .app-header {
          position: sticky;
          top: 0;
          z-index: 90;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          padding: 8px 18px 6px;
          background: rgba(255,255,255,.96);
          border-bottom: 1px solid #f4e4dd;
          box-shadow: 0 8px 24px rgba(90,50,30,.06);
          backdrop-filter: blur(10px);
        }

        .app-logo-wrap {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .app-logo-wrap img {
          height: 86px;
          width: auto;
          object-fit: contain;
        }

        .app-logo-wrap .admin-secret {
          position: absolute;
          left: -18px;
          top: 22px;
        }

        .review-chip {
          justify-self: start;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #fff7f3;
          border: 1px solid #f0ddd6;
          color: #7a2e3e;
          border-radius: 18px;
          padding: 8px 11px;
          box-shadow: 0 8px 18px rgba(90,50,30,.07);
        }

        .review-chip strong { font-size: 14px; }
        .review-chip small {
          display: block;
          color: #6e5048;
          font-size: 11px;
          font-weight: 900;
          margin-top: 1px;
        }

        .review-star {
          color: #f4b23d;
          font-size: 25px;
          line-height: 1;
        }

        .header-actions {
          justify-self: end;
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 12px;
          min-width: 0;
        }

        .advisor-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          color: #25D366;
          padding: 8px 6px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.08;
          text-align: left;
          white-space: nowrap;
        }

        .advisor-btn svg {
          width: 35px;
          height: 35px;
          fill: #25D366;
        }

        .community-header-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #f0ddd6;
          border-radius: 999px;
          background: #fff7f3;
          color: #7a2e3e;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 8px 18px rgba(90,50,30,.07);
        }

        .community-header-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(90,50,30,.1);
        }

        .community-header-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          min-width: 17px;
          height: 17px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #c94462;
          color: white;
          border: 2px solid white;
          font-size: 10px;
          font-weight: 950;
        }

        .header-cart-btn {
          position: relative;
          background: transparent;
          color: #7a1f33;
          font-size: 32px;
          padding: 6px 2px;
        }

        .cart-badge {
          position: absolute;
          top: 2px;
          right: -7px;
          min-width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #c94462;
          color: white;
          font-size: 12px;
          font-weight: 950;
          border: 2px solid white;
        }

        .install-banner {
          margin: 12px 34px 0;
          display: grid;
          grid-template-columns: 1fr 104px;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 20px;
          background: linear-gradient(90deg, #fff2ed 0%, #fff8f4 58%, #ffece4 100%);
          border: 1px solid #f1ded6;
          box-shadow: 0 10px 28px rgba(90,50,30,.08);
        }

        .install-icon {
          width: 56px;
          height: 56px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          color: #c94462;
          background: rgba(255,255,255,.72);
          border: 1px solid #f0d6cd;
          font-size: 34px;
          font-weight: 950;
        }

        .install-copy strong {
          display: block;
          color: #7a1f33;
          font-size: 25px;
          margin-bottom: 4px;
        }

        .install-copy span {
          color: #6b403e;
          font-weight: 700;
          font-size: 18px;
        }

        .install-action {
          justify-self: end;
          width: 92px;
          height: 62px;
          border-radius: 20px;
          background: #9f1630;
          color: white;
          font-size: 44px;
          line-height: 1;
          box-shadow: 0 12px 24px rgba(159,22,48,.20);
        }

        .hero-premium {
          position: relative;
          margin: 10px 0 0;
          min-height: 330px;
          display: grid;
          grid-template-columns: 52% 48%;
          align-items: center;
          overflow: hidden;
          background: linear-gradient(90deg, #fffaf7 0%, #fff5ee 44%, #f4ded2 100%);
          border-bottom: 1px solid #f1ded6;
        }

        .hero-premium-copy {
          position: relative;
          z-index: 2;
          padding: 30px 40px;
        }

        .hero-premium-copy span {
          display: block;
          font-family: Georgia, serif;
          color: #5f3b33;
          font-size: 42px;
          line-height: 1;
        }

        .hero-premium-copy h1 {
          margin: 2px 0 22px;
          font-family: Georgia, serif;
          color: #b33150;
          font-size: 64px;
          line-height: .98;
          font-weight: 700;
          letter-spacing: -.8px;
        }

        .hero-premium-copy p {
          margin: 0;
          color: #4e332d;
          font-size: 22px;
          line-height: 1.3;
          font-weight: 900;
          max-width: 420px;
        }

        .hero-premium-image {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 58%;
          background-position: center right;
          background-size: cover;
          background-repeat: no-repeat;
          filter: saturate(1.03);
        }

        .hero-premium-image::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #fffaf7 0%, rgba(255,250,247,.78) 18%, rgba(255,250,247,.20) 45%, rgba(255,250,247,0) 72%);
        }

        .hero-premium-image::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 55% 85%, rgba(90,50,30,.16), transparent 36%);
          mix-blend-mode: multiply;
        }

        .home-feature-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          padding: 18px 38px 4px;
        }

        .home-feature-card {
          position: relative;
          min-height: 142px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
          border-radius: 18px;
          background: linear-gradient(135deg, #fff1eb 0%, #fffaf7 100%);
          border: 1px solid #f0ddd6;
          box-shadow: 0 10px 26px rgba(90,50,30,.08);
          padding: 22px 18px 18px 22px;
        }

        .home-feature-card div {
          position: relative;
          z-index: 2;
          max-width: 54%;
        }

        .home-feature-card strong {
          display: block;
          color: #8d1730;
          font-size: 24px;
          margin-bottom: 8px;
        }

        .home-feature-card span {
          display: block;
          color: #5f3b33;
          font-size: 16px;
          line-height: 1.25;
          margin-bottom: 14px;
          font-weight: 700;
        }

        .home-feature-card em {
          display: inline-block;
          font-style: normal;
          background: #b21d3a;
          color: white;
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 900;
        }

        .home-feature-card img {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 54%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        .home-feature-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #fff3ef 0%, rgba(255,243,239,.92) 38%, rgba(255,243,239,.12) 70%, rgba(255,243,239,0) 100%);
          pointer-events: none;
        }

        .main {
          grid-template-columns: 1fr 330px;
          padding-top: 20px;
          padding-bottom: 130px;
        }

        .catalog-tools {
          display: grid;
          grid-template-columns: 1fr auto;
        }

        .grid {
          grid-template-columns: repeat(3, minmax(160px, 1fr));
        }

        .card {
          border-radius: 14px;
        }

        .card img {
          height: 240px;
        }

        .favorite-btn {
          position: absolute;
          right: 10px;
          bottom: 10px;
          z-index: 4;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: rgba(255,255,255,.88);
          color: #8d1730;
          border: 1px solid #efdcd5;
          font-size: 23px;
          display: grid;
          place-items: center;
          box-shadow: 0 6px 14px rgba(0,0,0,.08);
        }

        .favorite-btn.active {
          background: #fff1f4;
          color: #c94462;
        }

        .side {
          position: sticky;
          top: 124px;
          align-self: start;
        }

        .floating-wa,
        .floating-cart,
        .floating-button {
          display: none !important;
        }

        .bottom-nav {
          position: fixed;
          left: 26px;
          right: 26px;
          bottom: 12px;
          z-index: 95;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          align-items: center;
          gap: 4px;
          background: rgba(255,255,255,.96);
          border: 1px solid #f0ddd6;
          border-radius: 20px;
          box-shadow: 0 12px 35px rgba(90,50,30,.16);
          padding: 10px 8px 8px;
          backdrop-filter: blur(10px);
        }

        .bottom-nav button {
          position: relative;
          display: grid;
          place-items: center;
          gap: 3px;
          background: transparent;
          color: #4b302b;
          font-size: 12px;
          font-weight: 900;
        }

        .bottom-nav button span {
          font-size: 24px;
          line-height: 1;
        }

        .bottom-nav button.active {
          color: #c94462;
        }

        .bottom-nav em {
          position: absolute;
          top: 0;
          right: 18%;
          min-width: 19px;
          height: 19px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #c94462;
          color: #fff;
          font-style: normal;
          font-size: 11px;
          border: 2px solid #fff;
        }

        .category-sheet-overlay {
          position: fixed;
          inset: 0;
          background: rgba(41,26,22,.35);
          z-index: 120;
          display: flex;
          align-items: flex-end;
        }

        .category-sheet {
          width: 100%;
          background: #fffaf7;
          border-radius: 24px 24px 0 0;
          padding: 18px 18px 24px;
          box-shadow: 0 -12px 40px rgba(0,0,0,.18);
        }

        .category-sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          color: #7a1f33;
          font-size: 20px;
        }

        .category-sheet-header button {
          background: #fff;
          border: 1px solid #efdcd5;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          color: #7a1f33;
          font-size: 24px;
        }

        .category-sheet-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .sheet-category {
          background: #fff;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          padding: 14px;
          color: #6e5048;
          text-align: left;
          font-size: 15px;
          box-shadow: 0 6px 14px rgba(0,0,0,.04);
        }

        .sheet-category.active {
          background: #c94462;
          color: white;
        }

        .home-admin-block {
          display: grid;
          gap: 8px;
          background: #fff7f3;
          border: 1px solid #f0ddd6;
          border-radius: 14px;
          padding: 12px;
          margin: 12px 0;
        }

        .home-admin-block img {
          width: 100%;
          max-height: 180px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid #eadbd3;
        }

        .admin-label {
          display: grid;
          gap: 6px;
          color: #6e5048;
          font-weight: 900;
          margin-bottom: 10px;
        }

        .admin-check {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid #eadbd3;
          border-radius: 12px;
          background: #fff7f3;
          color: #6e5048;
          font-weight: 900;
          margin-bottom: 8px;
        }

        .admin-check input {
          width: auto;
          margin: 0;
        }

        @media (max-width: 820px) {
          .app-header {
            grid-template-columns: auto auto minmax(0, 1fr);
            gap: 8px;
            padding: 7px 10px 6px;
          }

          .app-logo-wrap img { height: 58px; }
          .review-chip {
            padding: 6px 7px;
            gap: 5px;
            border-radius: 14px;
          }

          .review-star { font-size: 18px; }
          .review-chip strong { font-size: 12px; }
          .review-chip small { display: none; }

          .header-actions {
            gap: 7px;
            justify-content: flex-end;
          }

          .advisor-btn {
            gap: 4px;
            padding: 7px 4px;
            font-size: 11px;
          }

          .community-header-btn {
            padding: 8px 9px;
            font-size: 11px;
          }

          .advisor-btn svg {
            width: 26px;
            height: 26px;
          }

          .header-cart-btn {
            font-size: 26px;
            padding: 6px 0;
          }

          .install-banner {
            margin: 10px 14px 0;
            grid-template-columns: 1fr 76px;
            gap: 10px;
            padding: 12px 12px;
            border-radius: 16px;
          }

          .install-icon {
            width: 44px;
            height: 44px;
            font-size: 27px;
            border-radius: 13px;
          }

          .install-copy strong {
            font-size: 18px;
          }

          .install-copy span {
            font-size: 14px;
          }

          .install-action {
            width: 66px;
            height: 50px;
            font-size: 36px;
            border-radius: 16px;
          }

          .hero-premium {
            min-height: 260px;
            grid-template-columns: 1fr;
          }

          .hero-premium-copy {
            padding: 26px 22px;
          }

          .hero-premium-copy span {
            font-size: 31px;
          }

          .hero-premium-copy h1 {
            font-size: 48px;
            max-width: 230px;
            margin-bottom: 18px;
          }

          .hero-premium-copy p {
            font-size: 19px;
            max-width: 230px;
          }

          .hero-premium-image {
            width: 66%;
          }

          .home-feature-cards {
            padding: 14px 14px 4px;
            gap: 10px;
          }

          .home-feature-card {
            min-height: 112px;
            padding: 14px 12px;
            border-radius: 16px;
          }

          .home-feature-card strong {
            font-size: 17px;
          }

          .home-feature-card span {
            font-size: 12px;
          }

          .home-feature-card em {
            padding: 7px 10px;
            font-size: 11px;
          }

          .main {
            display: block;
            padding: 16px 14px 130px;
          }

          .catalog-tools {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .sort-select {
            justify-self: center;
            min-width: 160px;
          }

          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .card img {
            height: 176px;
          }

          .side {
            position: static;
            margin-top: 18px;
          }

          .bottom-nav {
            left: 10px;
            right: 10px;
            bottom: 8px;
            border-radius: 18px;
          }

          .bottom-nav button {
            font-size: 11px;
          }

          .bottom-nav button span {
            font-size: 22px;
          }

          .footer {
            display: none;
          }
        }

        @media (max-width: 430px) {
          .app-header {
            grid-template-columns: auto auto minmax(0, 1fr);
            gap: 6px;
            padding-inline: 8px;
          }

          .app-logo-wrap img { height: 48px; }
          .advisor-btn span { display: inline; }
          .advisor-btn svg { width: 23px; height: 23px; }
          .header-actions { gap: 5px; }
          .advisor-btn {
            font-size: 10px;
            padding: 6px 2px;
          }
          .community-header-btn {
            padding: 7px 8px;
            font-size: 10px;
          }
          .header-cart-btn {
            font-size: 24px;
          }
          .cart-badge {
            min-width: 17px;
            height: 17px;
            font-size: 10px;
            right: -6px;
          }
          .community-header-badge {
            min-width: 15px;
            height: 15px;
            font-size: 9px;
          }
          .review-chip {
            padding: 5px 6px;
          }
          .review-star {
            font-size: 16px;
          }
          .review-chip strong {
            font-size: 11px;
          }

          .hero-premium {
            min-height: 242px;
          }

          .hero-premium-copy {
            padding: 22px 20px;
          }

          .hero-premium-copy h1 {
            font-size: 42px;
            max-width: 215px;
          }

          .hero-premium-copy p {
            font-size: 17px;
            max-width: 200px;
          }

          .hero-premium-image {
            width: 68%;
          }
        }
      `}</style>

      {toast && <div className="toast">{toast}</div>}

      {showAdminLogin && !showAdmin && (
        <AdminLogin
          onAuthenticated={() => {
            setShowAdmin(true);
            setShowAdminLogin(false);
          }}
          onClose={() => setShowAdminLogin(false)}
        />
      )}

      <header className="app-header">
        <button
          className="review-chip"
          onClick={scrollToReviews}
          aria-label="Ver reseñas"
        >
          <span className="review-star">★</span>
          <span>
            <strong>{reviewAverage}</strong> ({reviewCount})
            <small>Reseñas</small>
          </span>
        </button>

        <div className="app-logo-wrap">
          <button
            className="admin-secret"
            onClick={() => {
              if (showAdmin) return;
              setShowAdminLogin(true);
            }}
            disabled={adminAuthLoading}
            title={adminAuthLoading ? "Verificando sesión" : "Admin"}
            aria-label="Abrir acceso administrativo"
          >
            •
          </button>

          <img src={logo} alt="V&A Style" />
        </div>

        <div className="header-actions">
          <button
            className="advisor-btn"
            onClick={() => openLink("https://wa.me/524776311393")}
          >
            <WhatsAppIcon />
            <span>Hablar con<br />un asesor</span>
          </button>

          <button
            className="community-header-btn"
            onClick={() => {
              setShowCommunity(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-label="Abrir Comunidad V&A Style"
          >
            Comunidad 🔔
            {COMMUNITY_UNREAD_COUNT > 0 && (
              <span className="community-header-badge">{COMMUNITY_UNREAD_COUNT}</span>
            )}
          </button>

          <button className="header-cart-btn" onClick={scrollToCart}>
            🛒
            {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
          </button>
        </div>
      </header>

      {homeSettings.show_install_banner && (
        <section className="install-banner">
          <div className="install-copy">
            <strong>{homeSettings.install_banner_title || "Instala V & A Style"}</strong>
            <span>{homeSettings.install_banner_subtitle || "Lleva tu tienda siempre contigo"}</span>
          </div>
          <button className="install-action" onClick={handleInstallAppClick} aria-label="Instalar V & A Style">
            ↓
          </button>
        </section>
      )}

      <section className="hero-premium">
        <div className="hero-premium-copy">
          <h1>{homeSettings.hero_title || DEFAULT_HOME_SETTINGS.hero_title}</h1>
          <p>{homeSettings.hero_subtitle || DEFAULT_HOME_SETTINGS.hero_subtitle}</p>
        </div>
        <div
          className="hero-premium-image"
          style={{ backgroundImage: `url(${homeSettings.hero_image_url || FALLBACK_HOME_IMAGE})` }}
        />
      </section>

      <section className="home-feature-cards">
        <button
          className="home-feature-card"
          onClick={openNewArrivalsView}
        >
          <div>
            <strong>{homeSettings.new_arrivals_title || DEFAULT_HOME_SETTINGS.new_arrivals_title}</strong>
            <span>{homeSettings.new_arrivals_subtitle || DEFAULT_HOME_SETTINGS.new_arrivals_subtitle}</span>
            <em>Ver todo</em>
          </div>
          <img
            src={homeSettings.new_arrivals_image_url || FALLBACK_HOME_IMAGE}
            alt="New Arrivals V & A Style"
            loading="lazy"
            decoding="async"
          />
        </button>

        <button
          className="home-feature-card"
          onClick={openBestSellersView}
        >
          <div>
            <strong>{homeSettings.best_sellers_title || DEFAULT_HOME_SETTINGS.best_sellers_title}</strong>
            <span>{homeSettings.best_sellers_subtitle || DEFAULT_HOME_SETTINGS.best_sellers_subtitle}</span>
            <em>Ver todo</em>
          </div>
          <img
            src={homeSettings.best_sellers_image_url || FALLBACK_HOME_IMAGE}
            alt="Más vendidos V & A Style"
            loading="lazy"
            decoding="async"
          />
        </button>
      </section>

      {showAdmin && (
        <div className="admin-toolbar">
          <button onClick={openAddProductModal}>➕ Agregar producto</button>
          <button onClick={openBulkUploadModal}>📦 Carga masiva</button>
          <button onClick={() => setAdminModal("showroom")}>✨ Showroom</button>
          <button onClick={() => setAdminModal("home")}>🏠 Home</button>
          <button onClick={() => setAdminModal("community")}>💬 Comunidad</button>
          <button onClick={() => { setAdminModal("orders"); setNewOrderNotice(""); fetchOrders(); }}>🧾 Pedidos {orders.length ? `(${orders.length})` : ""}</button>
          <button onClick={() => setAdminModal("reviews")}>⭐ Reseñas ({pendingReviews.length})</button>
          <button className="logout-btn" onClick={closeAdminSession}>🚪 Cerrar sesión admin</button>
        </div>
      )}

      <main className="main">
        <section ref={catalogRef}>
          <div className="catalog-tools">
            <input
              className="search-input"
              placeholder="🔎 Buscar por código, modelo, marca o categoría"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
                scrollToCatalog();
              }}
            />
            <select
              className="sort-select"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setCurrentPage(1);
                scrollToCatalog();
              }}
            >
              <option value="az">Orden: A-Z</option>
              <option value="recent">Subidos recientemente</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-results">
              {currentView === "favoritos"
                ? "Todavía no tienes favoritos guardados."
                : currentView === "novedades"
                  ? "Todavía no hay productos marcados como novedad."
                  : currentView === "masVendidos"
                    ? "Todavía no hay productos marcados como más vendidos."
                    : "No encontramos productos con esa búsqueda."}
            </div>
          ) : (
            <>
              <div className="grid">
                {paginatedProductGroups.map((group) => (
                  <div className="card" key={group.id}>
                    {group.variants.length > 1 && (
                      <div className="variant-count">{group.variants.length} colores</div>
                    )}

                    {getDiscountPercent(group.discountPercent) > 0 && (
                      <div className="discount-badge">-{getDiscountPercent(group.discountPercent)}%</div>
                    )}

                    <button
                      className={isFavoriteGroup(group) ? "favorite-btn active" : "favorite-btn"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteGroup(group);
                      }}
                      aria-label="Agregar a favoritos"
                    >
                      {isFavoriteGroup(group) ? "♥" : "♡"}
                    </button>

                    <img
                      src={group.image}
                      alt={group.name}
                      loading="lazy"
                      decoding="async"
                      onClick={() => openProductGroup(group)}
                    />

                    <div className="card-body">
                      <h3>{group.name}</h3>
                      {group.brand && <div className="brand">{group.brand}</div>}

                      {getDiscountPercent(group.discountPercent) > 0 ? (
                        <div className="price-block">
                          <span className="old-price">${formatMoney(group.price)} MXN</span>
                          <div className="sale-price">${formatMoney(getFinalPrice(group))} MXN</div>
                        </div>
                      ) : (
                        <div className="price">${formatMoney(group.price)} MXN</div>
                      )}

                      <button className="add" onClick={() => openProductGroup(group)}>
                        Ver colores 🛍️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    disabled={safeCurrentPage === 1}
                    onClick={() => {
                      setCurrentPage((page) => Math.max(1, page - 1));
                      scrollToCatalog();
                    }}
                  >
                    ← Anterior
                  </button>

                  <span className="page-info">
                    Página {safeCurrentPage} de {totalPages}
                  </span>

                  <button
                    className="page-btn"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => {
                      setCurrentPage((page) => Math.min(totalPages, page + 1));
                      scrollToCatalog();
                    }}
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="side" ref={cartRef}>
          <div className="box">
            <div className="box-header">
              <span>🛒 Tu carrito ({cart.length})</span>
              <button
                className="cart-btn"
                onClick={() => {
                  setCart([]);
                  localStorage.removeItem(ORDER_SENT_KEY);
                  localStorage.removeItem(LAST_ADVISOR_KEY);
                }}
              >
                ×
              </button>
            </div>

            <div className="cart-content">
              {cart.length === 0 ? (
                <>
                  <p>Aún no agregas productos</p>
                  <p>Agrega productos para iniciar tu pedido.</p>
                </>
              ) : (
                <>
                  <div className="cart-items-scroll">
                    {[...cartSummary].reverse().map((item, index) => (
                      <div key={index} className="cart-item">
                        <div>
                          {item.modelCode || item.name}{item.variantColor ? ` / ${item.variantColor}` : ""}{item.brand ? ` / ${item.brand}` : ""}{item.selectedSize ? ` / Talla: ${item.selectedSize}` : ""}{item.discountPercent ? ` / Desc. ${item.discountPercent}%` : ""}{item.quantity > 1 ? ` x${item.quantity}` : ""}
                        </div>
                        <div className="cart-item-price">${formatMoney(item.price * item.quantity)} MXN</div>
                      </div>
                    ))}
                  </div>

                  <div className="cart-total">
                    <div className="subtotal-row">Subtotal: ${formatMoney(subtotal)} MXN</div>

                    {volumeDiscount > 0 && (
                      <div className="discount-row">
                        Descuento mayoreo 5%: -${formatMoney(volumeDiscount)} MXN
                      </div>
                    )}

                    {needsShippingQuote ? (
                      <div className="shipping-note">
                        📦 Pedidos de más de 40 piezas requieren cotización de envío directamente con tu asesora.
                      </div>
                    ) : (
                      <>
                        <div className="subtotal-row">Envío a domicilio: ${formatMoney(shippingAndPaymentCost)} MXN</div>
                        <div className="discount-row">Total a pagar: ${formatMoney(total)} MXN</div>
                      </>
                    )}
                  </div>

                  {cart.length < 6 && (
                    <p className="minimum-order">
                      Pedido mínimo: 6 piezas. Te faltan {6 - cart.length} pieza{6 - cart.length === 1 ? "" : "s"}.
                    </p>
                  )}

                  <button className="whatsapp-order-btn" onClick={openAdvisorOrderModal}>
                    Enviar pedido a un asesor
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </main>

      <section className="info-section">
        <div className="info-card" ref={aboutRef}>
          <h2>Nosotros</h2>
          <p>
            Somos una distribuidora de bolsas calidad premium estilo diseñador.
            Trabajamos modelos cuidadosamente seleccionados con excelente calidad
            y acabados premium.
          </p>
          <p>
            En V & A Style buscamos ofrecer productos modernos, elegantes y
            accesibles para emprendedores y clientes que buscan calidad y confianza.
            Si deseas iniciar tu negocio o surtir tu boutique, somos una excelente
            opción para ti.
          </p>

          <ul className="trust-list">
            <li>Pedidos 100% garantizados</li>
            <li>Compra con confianza</li>
            <li>Envíos a todo México</li>
            <li>Atendemos desde nuestra tienda física en León, Guanajuato, con envíos a todo México</li>
            <li>Atención personalizada</li>
          </ul>

          <p>
            <strong>Dirección:</strong><br />
            Calle Taxco #140, Colonia El Coecillo<br />
            C.P. 37260, León, Guanajuato
          </p>
        </div>

        <div className="info-card" ref={contactRef}>
          <h2>Contacto</h2>
          <p>
            Escríbenos directamente por WhatsApp o síguenos en redes sociales
            para conocer novedades, modelos disponibles y promociones.
          </p>

          <div className="contact-buttons">
            <button
              className="contact-btn whatsapp-btn"
              onClick={() => openLink("https://wa.me/524776311393")}
            >
              <WhatsAppIcon /> WhatsApp Ventas
            </button>

            <button
              className="contact-btn facebook-btn"
              onClick={() =>
                openLink("https://www.facebook.com/share/1EfzrWvU3m/?mibextid=wwXIfr")
              }
            >
              <FacebookIcon /> Facebook
            </button>

            <button
              className="contact-btn instagram-btn"
              onClick={() =>
                openLink("https://www.instagram.com/v_a_style.mx?igsh=MXdpdXlqOWE3ZGx2ag%3D%3D&utm_source=qr")
              }
            >
              <InstagramIcon /> Instagram
            </button>

            <button
              className="contact-btn tiktok-btn"
              onClick={() =>
                openLink("https://www.tiktok.com/@va.style.mx?_r=1&_t=ZS-96qpRM125Z4")
              }
            >
              <TikTokIcon /> TikTok
            </button>
          </div>
        </div>
      </section>

      <section className="reviews-section" ref={reviewsRef}>
        <div className="section-title-wrap">
          <h2>⭐ Opiniones de nuestros clientes</h2>
          <p>Experiencias reales de clientes V & A Style.</p>
        </div>

        {reviews.length > 0 && (
          <div className="reviews-grid">
            {reviews.map((review) => (
              <div className="review-card" key={review.id}>
                <div className="review-stars">{"⭐".repeat(Number(review.rating) || 5)}</div>
                <p>“{review.comment}”</p>
                <strong>— {review.customer_name}</strong>

                {review.media_url && /\.(mp4|mov|webm|ogg)(\?.*)?$/i.test(review.media_url) && (
                  <video src={review.media_url} controls className="review-media" />
                )}

                {review.media_url && !/\.(mp4|mov|webm|ogg)(\?.*)?$/i.test(review.media_url) && (
                  <img
                    src={review.media_url}
                    alt="Reseña de cliente"
                    className="review-media"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="review-form-card">
          <h3>Comparte tu experiencia</h3>
          <input
            placeholder="Tu nombre"
            value={reviewForm.name}
            onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })}
          />

          <select
            value={reviewForm.rating}
            onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
          >
            <option value="5">⭐⭐⭐⭐⭐ Excelente</option>
            <option value="4">⭐⭐⭐⭐ Muy buena</option>
            <option value="3">⭐⭐⭐ Buena</option>
            <option value="2">⭐⭐ Regular</option>
            <option value="1">⭐ Mala</option>
          </select>

          <textarea
            placeholder="Escribe tu reseña"
            value={reviewForm.comment}
            onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
          />

          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setReviewForm({ ...reviewForm, mediaFile: e.target.files[0] || null })}
          />

          <button className="pink-btn" onClick={submitReview} disabled={reviewSubmitting}>
            {reviewSubmitting ? "Enviando..." : "Enviar reseña"}
          </button>
        </div>
      </section>

      {cart.length > 0 && (
        <button
          className="floating-cart"
          onClick={scrollToCart}
        >
          🛒 {cart.length}
        </button>
      )}

      {checkoutModalOpen && (
        <div className="modal-overlay" onClick={closeCheckoutModal}>
          <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Datos para continuar</h3>
              <button className="modal-close-btn" onClick={closeCheckoutModal} disabled={checkoutLoading}>
                ×
              </button>
            </div>

            <p>
              Completa estos datos para registrar tu pedido y continuar al pago seguro con Mercado Pago.
            </p>

            <input
              type="text"
              placeholder="Nombre completo"
              value={checkoutForm.name}
              onChange={(e) => setCheckoutForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={checkoutLoading}
            />

            <input
              type="tel"
              inputMode="tel"
              placeholder="WhatsApp con lada"
              value={checkoutForm.phone}
              onChange={(e) => setCheckoutForm((prev) => ({ ...prev, phone: e.target.value }))}
              disabled={checkoutLoading}
            />

            <div className="checkout-total">
              Total a pagar: ${formatMoney(total)} MXN
              {MERCADO_PAGO_TEST_MODE && (
                <small>Modo prueba: envío y comisión desactivados.</small>
              )}
            </div>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={closeCheckoutModal} disabled={checkoutLoading}>
                Cancelar
              </button>
              <button className="mercadopago-btn" onClick={startMercadoPagoCheckout} disabled={checkoutLoading}>
                {checkoutLoading ? "Creando pago..." : "Continuar al pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {advisorOrderModalOpen && (
        <div className="modal-overlay" onClick={closeAdvisorOrderModal}>
          <div className="checkout-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Enviar pedido a un asesor</h3>
              <button
                className="modal-close-btn"
                onClick={closeAdvisorOrderModal}
                disabled={advisorOrderLoading}
              >
                ×
              </button>
            </div>

            <p>
              Déjanos tus datos y un asesor de V & A Style te contactará por WhatsApp.
            </p>

            <input
              type="text"
              placeholder="Nombre"
              value={advisorOrderForm.name}
              onChange={(event) =>
                setAdvisorOrderForm((current) => ({ ...current, name: event.target.value }))
              }
              disabled={advisorOrderLoading}
            />

            <input
              type="tel"
              inputMode="tel"
              placeholder="Teléfono"
              value={advisorOrderForm.phone}
              onChange={(event) =>
                setAdvisorOrderForm((current) => ({ ...current, phone: event.target.value }))
              }
              disabled={advisorOrderLoading}
            />

            <div className="checkout-total">
              Total estimado: ${formatMoney(total)} MXN
            </div>

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={closeAdvisorOrderModal}
                disabled={advisorOrderLoading}
              >
                Cancelar
              </button>
              <button
                className="whatsapp-order-btn"
                onClick={submitAdvisorOrder}
                disabled={advisorOrderLoading}
              >
                {advisorOrderLoading ? "Enviando pedido..." : "Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProductGroup && (
        <div className="modal-overlay" onClick={closeProductGroup}>
          <div className="variants-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="variants-header">
              <div>
                <h3>{selectedProductGroup.code}</h3>
                <p>{selectedProductGroup.brand} · ${formatMoney(getFinalPrice(selectedProductGroup))} MXN</p>
                <p>Desliza a los lados y elige cuántas piezas quieres de cada color.</p>
              </div>
              <button className="modal-close-btn" onClick={closeProductGroup}>×</button>
            </div>

            <div className="variants-scroll">
              {selectedProductGroup.variants.map((variant) => (
                <div className="variant-card" key={variant.id}>
                  <img
                    src={variant.image}
                    alt={variant.name}
                    loading="lazy"
                    decoding="async"
                    onClick={() => openImage(variant, selectedProductGroup.variants)}
                  />

                  <div className="variant-body">
                    <div className="variant-color">{variant.variantColor}</div>
                    {variant.brand && <div className="brand">{variant.brand}</div>}

                    {getDiscountPercent(variant.discountPercent) > 0 ? (
                      <div className="price-block">
                        <span className="old-price">${formatMoney(variant.price)} MXN</span>
                        <div className="sale-price">${formatMoney(getFinalPrice(variant))} MXN</div>
                      </div>
                    ) : (
                      <div className="price">${formatMoney(variant.price)} MXN</div>
                    )}

                    {variant.category === "Calzado" && (
                      <select
                        className="size-select"
                        value={selectedSizes[variant.id] || ""}
                        onChange={(e) =>
                          setSelectedSizes((prev) => ({
                            ...prev,
                            [variant.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Talla</option>
                        {getSizeOptions(variant.sizes).map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    )}

                    <button
                      className="variant-plus-btn"
                      onClick={() => addVariantDirectToCart(variant, selectedProductGroup)}
                      aria-label={`Agregar ${variant.name} al carrito`}
                    >
                      +
                    </button>

                    {showAdmin && (
                      <div style={{ marginTop: "10px" }}>
                        <button
                          className="cart-btn"
                          style={{ width: "100%", marginBottom: "8px" }}
                          onClick={() => toggleNewArrival(variant)}
                        >
                          {variant.isNewArrival ? "Quitar novedad" : "Marcar novedad"}
                        </button>

                        <button
                          className="cart-btn"
                          style={{ width: "100%", marginBottom: "8px" }}
                          onClick={() => toggleBestSeller(variant)}
                        >
                          {variant.isBestSeller ? "Quitar más vendido" : "Marcar más vendido"}
                        </button>

                        <button
                          className="cart-btn"
                          style={{ width: "100%", marginBottom: "8px" }}
                          onClick={() => toggleHomeFeatured(variant)}
                        >
                          {variant.isHomeFeatured ? "Quitar destacado" : "Marcar destacado"}
                        </button>

                        <button
                          className="pink-btn"
                          style={{ width: "100%", marginBottom: "8px" }}
                          onClick={() => startEditProduct(variant)}
                        >
                          Editar
                        </button>

                        <button
                          className="delete-btn"
                          onClick={() => deleteProduct(variant.id)}
                        >
                          Borrar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>


          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="image-modal" onClick={closeImage}>
          <button className="close-modal" onClick={closeImage}>×</button>

          {selectedGallery.length > 1 && (
            <>
              <div className="image-counter">
                {selectedImageIndex + 1} / {selectedGallery.length}
              </div>
              <button
                className="gallery-nav-btn left"
                onClick={(e) => {
                  e.stopPropagation();
                  previousGalleryImage();
                }}
                aria-label="Imagen anterior"
              >
                ‹
              </button>
              <button
                className="gallery-nav-btn right"
                onClick={(e) => {
                  e.stopPropagation();
                  nextGalleryImage();
                }}
                aria-label="Imagen siguiente"
              >
                ›
              </button>
            </>
          )}

          <div
            className="image-modal-content"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={toggleZoom}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={selectedProduct.image}
              alt={selectedProduct.name}
              className="image-modal-img"
              loading="eager"
              decoding="async"
              draggable="false"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageZoom})`,
              }}
            />
          </div>

          <div className="image-modal-title">
            {selectedProduct.modelCode || selectedProduct.name}
            {selectedProduct.variantColor ? ` · ${selectedProduct.variantColor}` : ""}
          </div>
        </div>
      )}



      {showAdmin && adminModal === "community" && (
        <CommunityAdmin onClose={closeAdminModal} />
      )}

      {showAdmin && adminModal === "product" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editingProduct ? "✏️ Editar producto" : "➕ Agregar producto"}</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            <input
              placeholder="Nombre o código del producto"
              value={newProduct.name}
              onChange={(e) =>
                setNewProduct({
                  ...newProduct,
                  name: e.target.value.toUpperCase(),
                })
              }
            />

            <input
              placeholder="Marca. Ej: MICHAEL KORS, COACH, NIKE"
              value={newProduct.brand}
              onChange={(e) =>
                setNewProduct({
                  ...newProduct,
                  brand: e.target.value.toUpperCase(),
                })
              }
            />

            <select
              value={newProduct.category}
              onChange={(e) =>
                setNewProduct({
                  ...newProduct,
                  category: e.target.value,
                  shipping_factor: String(getDefaultShippingFactor(e.target.value)),
                })
              }
            >
              <option value="Bolsas">Bolsas</option>
              <option value="Carteras">Carteras</option>
              <option value="Mochilas">Mochilas</option>
              <option value="Crossbody">Crossbody</option>
              <option value="Maleta">Maleta</option>
              <option value="Muñequera">Muñequera</option>
              <option value="Línea económica">Línea económica</option>
              <option value="Hombre">Hombre</option>
              <option value="Calzado">Calzado</option>
            </select>

            {newProduct.category === "Calzado" && (
              <input
                placeholder="Tallas disponibles. Ej: 22, 23, 24, 25, 26"
                value={newProduct.sizes}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, sizes: e.target.value.toUpperCase() })
                }
              />
            )}

            <input
              placeholder="Precio mayorista"
              value={newProduct.precio_mayorista}
              onChange={(e) => setNewProduct({ ...newProduct, precio_mayorista: e.target.value })}
            />

            <input
              placeholder="Factor de envío. Ej: cartera 0.3, bolsa 1, mochila 1.5, maleta chica 4"
              value={newProduct.shipping_factor}
              onChange={(e) => setNewProduct({ ...newProduct, shipping_factor: e.target.value })}
            />

            <input
              placeholder="Descuento % opcional. Ej: 30"
              value={newProduct.discount_percent}
              onChange={(e) => setNewProduct({ ...newProduct, discount_percent: e.target.value })}
            />

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(newProduct.isNewArrival)}
                onChange={(e) => setNewProduct({ ...newProduct, isNewArrival: e.target.checked })}
              />
              Novedad / New Arrival
            </label>

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(newProduct.isBestSeller)}
                onChange={(e) => setNewProduct({ ...newProduct, isBestSeller: e.target.checked })}
              />
              Más vendido
            </label>

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(newProduct.isHomeFeatured)}
                onChange={(e) => setNewProduct({ ...newProduct, isHomeFeatured: e.target.checked })}
              />
              Destacado Home
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setNewProduct({ ...newProduct, imageFile: e.target.files[0] })}
            />

            <button className="pink-btn" style={{ width: "100%" }} onClick={saveProduct}>
              {editingProduct ? "Guardar cambios" : "Guardar producto"}
            </button>
          </div>
        </div>
      )}

      {showAdmin && adminModal === "bulk" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>📦 Carga masiva</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            <div className="bulk-note">
              Escribe el código base del modelo y la marca. Si pones <strong>MYK021</strong> y seleccionas 5 fotos, se crearán como <strong>MYK021 1</strong>, <strong>MYK021 2</strong>, <strong>MYK021 3</strong>... con la misma marca.
            </div>

            <input
              placeholder="Código o nombre base del modelo. Ej: MYK021"
              value={bulkUpload.baseName}
              disabled={bulkUpload.uploading}
              onChange={(e) =>
                setBulkUpload({ ...bulkUpload, baseName: e.target.value.toUpperCase() })
              }
            />

            <input
              placeholder="Marca para este modelo. Ej: MICHAEL KORS"
              value={bulkUpload.brand}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, brand: e.target.value.toUpperCase() })}
            />

            <select
              value={bulkUpload.category}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, category: e.target.value })}
            >
              <option value="Bolsas">Bolsas</option>
              <option value="Carteras">Carteras</option>
              <option value="Mochilas">Mochilas</option>
              <option value="Crossbody">Crossbody</option>
              <option value="Maleta">Maleta</option>
              <option value="Muñequera">Muñequera</option>
              <option value="Línea económica">Línea económica</option>
              <option value="Hombre">Hombre</option>
              <option value="Calzado">Calzado</option>
            </select>

            {bulkUpload.category === "Calzado" && (
              <input
                placeholder="Tallas disponibles para este modelo. Ej: 22, 23, 24, 25, 26"
                value={bulkUpload.sizes}
                disabled={bulkUpload.uploading}
                onChange={(e) => setBulkUpload({ ...bulkUpload, sizes: e.target.value.toUpperCase() })}
              />
            )}

            <input
              placeholder="Precio mayorista general"
              value={bulkUpload.precio_mayorista}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, precio_mayorista: e.target.value })}
            />

            <input
              placeholder="Descuento % opcional para este lote. Ej: 30"
              value={bulkUpload.discount_percent}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, discount_percent: e.target.value })}
            />

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(bulkUpload.isNewArrival)}
                disabled={bulkUpload.uploading}
                onChange={(e) => setBulkUpload({ ...bulkUpload, isNewArrival: e.target.checked })}
              />
              Marcar lote como Novedad
            </label>

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(bulkUpload.isBestSeller)}
                disabled={bulkUpload.uploading}
                onChange={(e) => setBulkUpload({ ...bulkUpload, isBestSeller: e.target.checked })}
              />
              Marcar lote como Más vendido
            </label>

            <label className="admin-check">
              <input
                type="checkbox"
                checked={Boolean(bulkUpload.isHomeFeatured)}
                disabled={bulkUpload.uploading}
                onChange={(e) => setBulkUpload({ ...bulkUpload, isHomeFeatured: e.target.checked })}
              />
              Marcar lote como Destacado Home
            </label>

            <input
              type="file"
              accept="image/*"
              multiple
              disabled={bulkUpload.uploading}
              onChange={(e) =>
                setBulkUpload({ ...bulkUpload, files: Array.from(e.target.files || []) })
              }
            />

            {bulkUpload.files.length > 0 && !bulkUpload.uploading && (
              <div className="bulk-note">
                Se seleccionaron <strong>{bulkUpload.files.length}</strong> imágenes.
              </div>
            )}

            <button
              className="pink-btn"
              style={{ width: "100%" }}
              onClick={saveBulkProducts}
              disabled={bulkUpload.uploading}
            >
              {bulkUpload.uploading ? "Subiendo productos..." : "Subir productos masivos"}
            </button>

            {bulkUpload.progress && (
              <div className="bulk-progress">{bulkUpload.progress}</div>
            )}
          </div>
        </div>
      )}

      {showAdmin && adminModal === "home" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🏠 Editar pantalla principal</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            <label className="admin-label">
              Mostrar banner de instalación
              <select
                value={homeSettings.show_install_banner ? "true" : "false"}
                onChange={(e) =>
                  setHomeSettings({ ...homeSettings, show_install_banner: e.target.value === "true" })
                }
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>

            <input
              placeholder="Título del banner de instalación"
              value={homeSettings.install_banner_title || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, install_banner_title: e.target.value })}
            />

            <input
              placeholder="Subtítulo del banner de instalación"
              value={homeSettings.install_banner_subtitle || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, install_banner_subtitle: e.target.value })}
            />

            <input
              placeholder="Título banner principal"
              value={homeSettings.hero_title || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, hero_title: e.target.value })}
            />

            <input
              placeholder="Subtítulo banner principal"
              value={homeSettings.hero_subtitle || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, hero_subtitle: e.target.value })}
            />

            <input
              placeholder="Título New Arrivals"
              value={homeSettings.new_arrivals_title || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, new_arrivals_title: e.target.value })}
            />

            <input
              placeholder="Subtítulo New Arrivals"
              value={homeSettings.new_arrivals_subtitle || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, new_arrivals_subtitle: e.target.value })}
            />

            <input
              placeholder="Título Más vendidos"
              value={homeSettings.best_sellers_title || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, best_sellers_title: e.target.value })}
            />

            <input
              placeholder="Subtítulo Más vendidos"
              value={homeSettings.best_sellers_subtitle || ""}
              onChange={(e) => setHomeSettings({ ...homeSettings, best_sellers_subtitle: e.target.value })}
            />

            <div className="home-admin-block">
              <strong>Banner principal</strong>
              {(homeSettings.hero_image_url || FALLBACK_HOME_IMAGE) && (
                <img src={homeSettings.hero_image_url || FALLBACK_HOME_IMAGE} alt="Banner principal" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setHomeForm({ ...homeForm, heroFile: e.target.files[0] || null })}
              />
            </div>

            <div className="home-admin-block">
              <strong>New Arrivals</strong>
              {(homeSettings.new_arrivals_image_url || FALLBACK_HOME_IMAGE) && (
                <img src={homeSettings.new_arrivals_image_url || FALLBACK_HOME_IMAGE} alt="New Arrivals" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setHomeForm({ ...homeForm, newArrivalsFile: e.target.files[0] || null })}
              />
            </div>

            <div className="home-admin-block">
              <strong>Más vendidos</strong>
              {(homeSettings.best_sellers_image_url || FALLBACK_HOME_IMAGE) && (
                <img src={homeSettings.best_sellers_image_url || FALLBACK_HOME_IMAGE} alt="Más vendidos" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setHomeForm({ ...homeForm, bestSellersFile: e.target.files[0] || null })}
              />
            </div>

            <button
              className="pink-btn"
              style={{ width: "100%" }}
              onClick={saveHomeSettings}
              disabled={homeForm.saving}
            >
              {homeForm.saving ? "Guardando..." : "Guardar pantalla principal"}
            </button>
          </div>
        </div>
      )}

      {showAdmin && adminModal === "showroom" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>✨ Administrar showroom</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            <div className="bulk-note">
              Sube una imagen para el showroom. No se pedirá título, descripción, modelo ni códigos; solo se mostrará la imagen como vitrina visual.
            </div>

            <input
              type="file"
              accept="image/*"
              disabled={showroomForm.uploading}
              onChange={(e) => setShowroomForm({ ...showroomForm, imageFile: e.target.files[0] || null })}
            />

            <button
              className="pink-btn"
              style={{ width: "100%" }}
              onClick={saveShowroomArrival}
              disabled={showroomForm.uploading}
            >
              {showroomForm.uploading ? "Subiendo imagen..." : "Guardar imagen"}
            </button>

            <div className="admin-review-list" style={{ marginTop: "16px" }}>
              {showroomItems.length === 0 ? (
                <div className="bulk-note">Todavía no hay imágenes en showroom.</div>
              ) : (
                showroomItems.map((item) => (
                  <div className="admin-review-item" key={item.id}>
                    <img
                      src={item.image_url}
                      alt="Showroom V & A Style"
                      className="review-media"
                      loading="lazy"
                      decoding="async"
                    />
                    <button className="delete-btn" onClick={() => deleteShowroomArrival(item.id)}>
                      Eliminar showroom
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showAdmin && adminModal === "orders" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🧾 Pedidos</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            {newOrderNotice && (
              <div className="orders-header-note new-order-notice">{newOrderNotice}</div>
            )}

            <div className="orders-header-note">
              {TEST_FREE_SHIPPING
                ? "Modo prueba activo: envío y cargo de servicio en $0."
                : "Pedidos registrados desde WhatsApp."}
            </div>

            <button className="pink-btn" style={{ width: "100%", marginBottom: "12px" }} onClick={fetchOrders}>
              Actualizar pedidos
            </button>

            {ordersLoading ? (
              <div className="bulk-note">Cargando pedidos...</div>
            ) : orders.length === 0 ? (
              <div className="bulk-note">Todavía no hay pedidos registrados.</div>
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div className="order-card" key={getOrderId(order)}>
                    <div className="order-card-top">
                      <div>
                        <strong>{order.customer_name || order.name || "Cliente sin nombre"}</strong>
                        <div className="order-id">ID: {getOrderId(order)}</div>
                      </div>
                      <div className="order-total">${formatMoney(order.total)} MXN</div>
                    </div>

                    <div className="order-grid">
                      <div className="order-field">
                        <span>Teléfono</span>
                        {order.customer_phone || order.phone || "Sin teléfono"}
                      </div>
                      <div className="order-field">
                        <span>Pago</span>
                        {getOrderPaymentStatus(order)}
                      </div>
                      <div className="order-field">
                        <span>Estado pedido</span>
                        {getOrderStatus(order)}
                      </div>
                      <div className="order-field">
                        <span>Fecha</span>
                        {formatDate(order.created_at)}
                      </div>
                    </div>

                    <select
                      className="order-status-select"
                      value={getOrderStatus(order)}
                      onChange={(e) => updateOrderStatus(order, e.target.value)}
                    >
                      {ORDER_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAdmin && adminModal === "reviews" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>⭐ Administrar reseñas</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            {reviews.length === 0 ? (
              <div className="bulk-note">Todavía no hay reseñas.</div>
            ) : (
              <div className="admin-review-list">
                {reviews.map((review) => (
                  <div className="admin-review-item" key={review.id}>
                    <strong>{review.customer_name}</strong>
                    <div>{"⭐".repeat(Number(review.rating) || 5)}</div>
                    <p>{review.comment}</p>
                    {review.media_url && review.media_type === "video" && (
                      <video src={review.media_url} controls className="review-media" />
                    )}
                    {review.media_url && review.media_type !== "video" && (
                      <img
                        src={review.media_url}
                        alt="Reseña"
                        className="review-media"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      {!review.approved && (
                        <button className="pink-btn" onClick={() => approveReview(review.id)}>
                          Aprobar
                        </button>
                      )}
                      <button className="delete-btn" onClick={() => deleteReview(review.id)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCategorySheet && (
        <div className="category-sheet-overlay" onClick={() => setShowCategorySheet(false)}>
          <div className="category-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="category-sheet-header">
              <strong>Categorías</strong>
              <button onClick={() => setShowCategorySheet(false)}>×</button>
            </div>
            <div className="category-sheet-grid">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={category === cat ? "sheet-category active" : "sheet-category"}
                  onClick={() => selectCategory(cat)}
                >
                  {cat === "Todas" ? "🎁 Todas" : cat === "Calzado" ? "👟 Calzado" : cat === "Hombre" ? "🧔 Hombre" : `👜 ${cat}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button
          className={currentView === "home" ? "active" : ""}
          onClick={openHomeView}
        >
          <span>🏠</span>
          Inicio
        </button>
        <button onClick={() => setShowCategorySheet(true)}>
          <span>▦</span>
          Categorías
        </button>
        <button
          className={currentView === "novedades" ? "active" : ""}
          onClick={openNewArrivalsView}
        >
          <span>✨</span>
          Novedades
        </button>
        <button
          className={currentView === "favoritos" ? "active" : ""}
          onClick={openFavoritesView}
        >
          <span>♡</span>
          Favoritos
          {favorites.length > 0 && <em>{favorites.length}</em>}
        </button>
        <button onClick={scrollToCart}>
          <span>🛒</span>
          Carrito
          {cart.length > 0 && <em>{cart.length}</em>}
        </button>
      </nav>

      <footer className="footer">
        <span>✨ Aquí empieza tu camino para emprender</span>
      </footer>
    </div>
  );
}
