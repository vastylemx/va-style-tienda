import { supabase } from "./supabase";
import logo from "./assets/5EBEC563-AD5B-47FB-AFE9-482289C13B90.jpg";
import { useState, useEffect, useRef } from "react";

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

const BETA_MODE = true;
const BETA_WHATSAPP_NUMBER = "524776311393";
const ADVISOR_NUMBERS = ["524779177633", "524821357950"];

const CART_STORAGE_KEY = "vaStyleCart";
const ORDER_SENT_KEY = "vaStyleOrderSent";
const LAST_ADVISOR_KEY = "vaStyleLastAdvisor";
const ADMIN_SESSION_KEY = "vaStyleAdminSession";

const GA_MEASUREMENT_ID = "G-TP0P6637D2";

function trackEvent(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
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

function getShippingCost(units) {
  const safeUnits = Number(units) || 0;

  if (safeUnits <= 0) return 0;
  if (safeUnits <= 12) return 400;
  if (safeUnits <= 30) return 550;
  if (safeUnits <= 42) return 950;
  if (safeUnits <= 60) return 1100;

  return null;
}

function getServiceFee(amount) {
  const baseAmount = getCleanPrice(amount);
  if (baseAmount <= 0) return 0;

  return Math.min(Math.round(baseAmount * 0.05 + 4), 100);
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
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showroomItems, setShowroomItems] = useState([]);
  const [category, setCategory] = useState("Bolsas");
  const [cart, setCart] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      return normalizeCartItems(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]"));
    } catch {
      return [];
    }
  });
  const [showAdmin, setShowAdmin] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      return localStorage.getItem(ADMIN_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });
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
    title: "",
    codes: "",
    description: "",
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

  const catalogRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const lastTapRef = useRef(0);
  const dragRef = useRef(null);
  const toastTimerRef = useRef(null);

  const ADMIN_PASSWORD = "vanda2025";

  const [newProduct, setNewProduct] = useState({
    name: "",
    brand: "",
    category: "Bolsas",
    sizes: "",
    discount_percent: "",
    isNewArrival: false,
    precio_mayorista: "",
    shipping_factor: "1",
    imageFile: null,
    image_url: "",
  });

  useEffect(() => {
    fetchProducts();
    fetchReviews();
    fetchShowroomArrivals();

    if (typeof window === "undefined") return;

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
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

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

  async function fetchProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
      return;
    }

    setProducts(
      data.map((p) => ({
        id: p.id,
        name: p.name,
        brand: (p.brand || "").toUpperCase(),
        category: normalizeCategory(p.category),
        sizes: p.sizes || "",
        discountPercent: getDiscountPercent(p.discount_percent),
        isNewArrival: Boolean(p.is_new_arrival),
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
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
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

  const approvedReviews = reviews.filter((review) => review.approved);
  const pendingReviews = reviews.filter((review) => !review.approved);
  const showroomArrivals = showroomItems.slice(0, 12);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = products.filter((p) => {
    const matchesCategory = category === "Todas" || p.category === category;

    const matchesSearch =
      !normalizedSearch ||
      p.name.toLowerCase().includes(normalizedSearch) ||
      (p.brand || "").toLowerCase().includes(normalizedSearch) ||
      p.category.toLowerCase().includes(normalizedSearch);

    return matchesCategory && matchesSearch;
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
  const totalPages = Math.max(1, Math.ceil(groupedProducts.length / PRODUCTS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE;
  const paginatedProductGroups = groupedProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  const cartSummary = getCartSummary(cart);

  const subtotal = cart
    .map((item) => getCleanPrice(item.price))
    .reduce((sum, price) => sum + price, 0);

  const volumeDiscount = cart.length >= 40 ? Math.round(subtotal * 0.05) : 0;

  const shippingUnits = cart
    .map((item) => getItemShippingFactor(item))
    .reduce((sum, factor) => sum + factor, 0);

  const shippingCost = getShippingCost(shippingUnits);
  const needsShippingQuote = shippingCost === null;

  const totalBeforeService = needsShippingQuote
    ? Math.max(subtotal - volumeDiscount, 0)
    : Math.max(subtotal - volumeDiscount + shippingCost, 0);

  const serviceFee = needsShippingQuote ? 0 : getServiceFee(totalBeforeService);
  const shippingAndPaymentCost = needsShippingQuote ? null : shippingCost + serviceFee;
  const total = totalBeforeService + serviceFee;

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
    const confirmDelete = confirm("¿Seguro que quieres borrar este producto?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    setCart(cart.filter((item) => item.id !== id));
    alert("Producto borrado correctamente");
    fetchProducts();
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

  function closeAdminSession() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setShowAdmin(false);
    setAdminModal(null);
    setEditingProduct(null);
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

  async function saveShowroomArrival() {
    if (!showroomForm.title.trim()) {
      alert("Escribe el título del showroom.");
      return;
    }

    if (!showroomForm.codes.trim()) {
      alert("Escribe el código o códigos visibles.");
      return;
    }

    if (!showroomForm.imageFile) {
      alert("Selecciona una imagen para el showroom.");
      return;
    }

    setShowroomForm((prev) => ({ ...prev, uploading: true }));

    try {
      const file = await compressImage(showroomForm.imageFile, 1600, 0.84);
      const safeName = showroomForm.title
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      const fileName = `${Date.now()}-${safeName || "showroom"}.jpg`;

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
          title: showroomForm.title.trim().toUpperCase(),
          codes: showroomForm.codes.trim().toUpperCase(),
          description: showroomForm.description.trim(),
          image_url: publicUrl,
        },
      ]);

      if (error) throw error;

      alert("Showroom guardado correctamente");
      setShowroomForm({
        title: "",
        codes: "",
        description: "",
        imageFile: null,
        uploading: false,
      });
      setAdminModal(null);
      fetchShowroomArrivals();
    } catch (error) {
      alert(error.message || "No se pudo guardar el showroom.");
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

  async function toggleNewArrival(product) {
    const { error } = await supabase
      .from("products")
      .update({ is_new_arrival: !product.isNewArrival })
      .eq("id", product.id);

    if (error) {
      alert(error.message);
      console.log(error);
      return;
    }

    fetchProducts();
  }

  async function getSelectedWhatsAppNumber() {
    if (BETA_MODE) {
      localStorage.setItem(LAST_ADVISOR_KEY, BETA_WHATSAPP_NUMBER);
      return BETA_WHATSAPP_NUMBER;
    }

    const savedAdvisor = localStorage.getItem(LAST_ADVISOR_KEY);

    if (savedAdvisor) {
      return savedAdvisor;
    }

    const { data: nextIndex, error: rotationError } = await supabase.rpc(
      "get_next_whatsapp_index",
      { total_numbers: ADVISOR_NUMBERS.length }
    );

    if (rotationError) {
      console.log(rotationError);
      throw new Error("Error asignando asesor. Intenta de nuevo.");
    }

    const selectedNumber = ADVISOR_NUMBERS[nextIndex];
    localStorage.setItem(LAST_ADVISOR_KEY, selectedNumber);

    return selectedNumber;
  }

  async function sendWhatsApp() {
    if (cart.length < 6) {
      alert("Pedido mínimo: 6 piezas.");
      return;
    }

    const customerName = prompt("Nombre del cliente:");
    if (!customerName || !customerName.trim()) return;

    let selectedNumber;

    try {
      selectedNumber = await getSelectedWhatsAppNumber();
    } catch (error) {
      alert(error.message);
      return;
    }

    const isAdditionalOrder = localStorage.getItem(ORDER_SENT_KEY) === "true";

    const productsText = getCartSummary(cart)
      .map((item, index) => {
        const modelText = item.modelCode || item.name;
        const colorText = item.variantColor ? ` / Color: ${item.variantColor}` : "";
        const brandText = item.brand ? ` / ${item.brand}` : "";
        const sizeText = item.selectedSize ? ` / Talla: ${item.selectedSize}` : "";
        const discountText = item.discountPercent ? ` / Desc. ${item.discountPercent}%` : "";
        const quantityText = item.quantity > 1 ? ` x${item.quantity}` : "";

        return `${index + 1}. ${modelText}${colorText}${brandText}${sizeText}${discountText}${quantityText} - $${formatMoney(item.price * item.quantity)} MXN`;
      })
      .join("\n");

    const message = `
Hola, quiero hacer este pedido en V & A Style

${isAdditionalOrder ? "AGREGADO A PEDIDO ANTERIOR\n" : ""}DATOS DEL CLIENTE
Nombre: ${customerName.trim()}

PEDIDO
${productsText}

SUBTOTAL: $${formatMoney(subtotal)} MXN
${volumeDiscount > 0 ? `DESCUENTO MAYOREO 5%: -$${formatMoney(volumeDiscount)} MXN
` : ""}ENVÍO Y PAGO SEGURO: ${needsShippingQuote ? "POR COTIZAR" : `$${formatMoney(shippingAndPaymentCost)} MXN`}
TOTAL FINAL: ${needsShippingQuote ? "POR CONFIRMAR" : `$${formatMoney(total)} MXN`}

Gracias
`;

    trackEvent("send_whatsapp_order", {
      items: cart.length,
      subtotal,
      discount: volumeDiscount,
      shipping_units: shippingUnits,
      shipping_cost: shippingCost || 0,
      service_fee: serviceFee,
      value: total,
      currency: "MXN",
    });

    localStorage.setItem(ORDER_SENT_KEY, "true");

    const encodedMessage = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${selectedNumber}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${selectedNumber}?text=${encodedMessage}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      window.location.assign(appUrl);

      setTimeout(() => {
        window.location.assign(webUrl);
      }, 1200);
    } else {
      window.location.assign(webUrl);
    }
  }

  function scrollToCatalog() {
    setTimeout(() => {
      catalogRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function openLink(url) {
    window.location.assign(url);
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

        .new-arrivals-section,
        .reviews-section {
          margin: 22px 38px 0;
          background: white;
          border: 1px solid #eadbd3;
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 8px 26px rgba(90,50,30,.10);
        }

        .section-title-wrap {
          text-align: center;
          margin-bottom: 16px;
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
          display: grid;
          grid-template-columns: repeat(4, minmax(140px, 1fr));
          gap: 14px;
        }

        .arrival-card {
          background: #fffaf7;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          overflow: hidden;
          padding: 0;
          box-shadow: 0 7px 18px rgba(90,50,30,.10);
        }

        .arrival-card img {
          width: 100%;
          height: 170px;
          object-fit: contain;
          display: block;
          background: #fff4ea;
        }

        .arrival-card span {
          display: block;
          padding: 10px;
          color: #7a4050;
          font-size: 14px;
          font-weight: 950;
          text-align: center;
        }

        .arrival-title {
          color: #2f2927;
          font-size: 13px;
          font-weight: 900;
          text-align: center;
          padding: 0 10px 4px;
        }

        .arrival-desc {
          color: #6b403e;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.35;
          text-align: center;
          padding: 0 10px 12px;
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

        .admin-review-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .side {
          display: flex;
          flex-direction: column;
          gap: 32px;
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

          .new-arrivals-section,
          .reviews-section {
            margin: 14px 10px 0;
            padding: 15px 12px;
            border-radius: 16px;
          }

          .section-title-wrap h2 {
            font-size: 23px;
          }

          .section-title-wrap p {
            font-size: 12px;
          }

          .new-arrivals-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .arrival-card img {
            height: 135px;
          }

          .arrival-card span {
            font-size: 12px;
            padding: 8px;
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
      `}</style>

      {toast && <div className="toast">{toast}</div>}

      <header className="navbar">
        <div className="logo-wrap">
          <button
            className="admin-secret"
            onClick={() => {
              if (showAdmin) return;

              const password = prompt("Contraseña admin");
              if (password === ADMIN_PASSWORD) {
                localStorage.setItem(ADMIN_SESSION_KEY, "true");
                setShowAdmin(true);
              } else {
                alert("Contraseña incorrecta");
              }
            }}
            title="Admin"
          >
            •
          </button>

          <img src={logo} alt="V&A Style" style={{ height: "90px", objectFit: "contain" }} />
        </div>

        <nav className="menu">
          <span onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Inicio</span>
          <span onClick={() => aboutRef.current?.scrollIntoView({ behavior: "smooth" })}>Nosotros</span>
          <span onClick={() => contactRef.current?.scrollIntoView({ behavior: "smooth" })}>Contacto</span>
        </nav>

        <div className="nav-actions">
          <button
            className="cart-btn top-cart"
            onClick={() =>
              document.querySelector(".side")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            🛒 Carrito ({cart.length})
          </button>
        </div>
      </header>

      <section className="hero">
        <h1>Descubre V & A Style ✨</h1>
        <p>✨ Estás a un paso de comenzar tu sueño</p>
      </section>

      {showAdmin && (
        <div className="admin-toolbar">
          <button onClick={openAddProductModal}>➕ Agregar producto</button>
          <button onClick={openBulkUploadModal}>📦 Carga masiva</button>
          <button onClick={() => setAdminModal("showroom")}>✨ Showroom</button>
          <button onClick={() => setAdminModal("reviews")}>⭐ Reseñas ({pendingReviews.length})</button>
          <button className="logout-btn" onClick={closeAdminSession}>🚪 Cerrar sesión admin</button>
        </div>
      )}

      {showroomArrivals.length > 0 && (
        <section className="new-arrivals-section">
          <div className="section-title-wrap">
            <h2>✨ New Arrivals</h2>
            <p>Showroom de nuevas colecciones. Busca los códigos en el catálogo para agregarlos a tu pedido.</p>
          </div>

          <div className="new-arrivals-grid">
            {showroomArrivals.map((item) => (
              <div className="arrival-card" key={item.id}>
                <img src={item.image_url} alt={item.title} />
                <span>{item.codes}</span>
                {item.title && <div className="arrival-title">{item.title}</div>}
                {item.description && <div className="arrival-desc">{item.description}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <main className="main">
        <section ref={catalogRef}>
          <div className="filters">
            {categories.map((cat) => (
              <button
                key={cat}
                className={category === cat ? "filter active" : "filter"}
                onClick={() => {
                  setCategory(cat);
                  setCurrentPage(1);
                  scrollToCatalog();
                }}
              >
                {cat === "Todas" ? "🎁 Todas" : cat === "Calzado" ? "👟 Calzado" : cat === "Hombre" ? "🧔 Hombre" : `👜 ${cat}`}
              </button>
            ))}
          </div>

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
            <div className="results-count">
              {groupedProducts.length} modelo{groupedProducts.length === 1 ? "" : "s"}
            </div>

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
              No encontramos productos con esa búsqueda.
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

                    <img
                      src={group.image}
                      alt={group.name}
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

        <aside className="side">
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

                    <div className="subtotal-row">
                      Envío y pago seguro: {needsShippingQuote ? "Por cotizar" : `$${formatMoney(shippingAndPaymentCost)} MXN`}
                    </div>

                    TOTAL FINAL<br />
                    {needsShippingQuote ? "Por confirmar" : `$${formatMoney(total)} MXN`}
                  </div>

                  {cart.length < 6 && (
                    <p className="minimum-order">
                      Pedido mínimo: 6 piezas. Te faltan {6 - cart.length} pieza{6 - cart.length === 1 ? "" : "s"}.
                    </p>
                  )}

                  <button className="pink-btn" onClick={sendWhatsApp}>
                    WhatsApp Enviar pedido
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
            <li>Local establecido en León, Guanajuato</li>
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

      <section className="reviews-section">
        <div className="section-title-wrap">
          <h2>⭐ Opiniones de nuestros clientes</h2>
          <p>Experiencias reales de clientes V & A Style.</p>
        </div>

        {approvedReviews.length > 0 && (
          <div className="reviews-grid">
            {approvedReviews.slice(0, 8).map((review) => (
              <div className="review-card" key={review.id}>
                <div className="review-stars">{"⭐".repeat(Number(review.rating) || 5)}</div>
                <p>“{review.comment}”</p>
                <strong>— {review.customer_name}</strong>

                {review.media_url && review.media_type === "video" && (
                  <video src={review.media_url} controls className="review-media" />
                )}

                {review.media_url && review.media_type !== "video" && (
                  <img src={review.media_url} alt="Reseña de cliente" className="review-media" />
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
          onClick={() =>
            document.querySelector(".side")?.scrollIntoView({
              behavior: "smooth",
            })
          }
        >
          🛒 {cart.length}
        </button>
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

                    <div className="qty-control">
                      <button onClick={() => updateVariantQuantity(variant.id, (variantQuantities[variant.id] || 0) - 1)}>−</button>
                      <span>{variantQuantities[variant.id] || 0}</span>
                      <button onClick={() => updateVariantQuantity(variant.id, (variantQuantities[variant.id] || 0) + 1)}>+</button>
                    </div>

                    {showAdmin && (
                      <div style={{ marginTop: "10px" }}>
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

            <div className="variants-footer">
              <button className="pink-btn" onClick={() => addVariantsToCart(selectedProductGroup)}>
                Agregar selección 🛒
              </button>
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

      {showAdmin && adminModal === "showroom" && (
        <div className="modal-overlay" onClick={closeAdminModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>✨ Administrar showroom</h3>
              <button className="modal-close-btn" onClick={closeAdminModal}>×</button>
            </div>

            <div className="bulk-note">
              Sube fotos grupales, editoriales o banners de nuevas colecciones. Esto NO agrega productos al carrito; solo funciona como vitrina visual.
            </div>

            <input
              placeholder="Título. Ej: NUEVA COLECCIÓN MK"
              value={showroomForm.title}
              disabled={showroomForm.uploading}
              onChange={(e) => setShowroomForm({ ...showroomForm, title: e.target.value.toUpperCase() })}
            />

            <input
              placeholder="Códigos visibles. Ej: MYK021 • COA118 • LV550"
              value={showroomForm.codes}
              disabled={showroomForm.uploading}
              onChange={(e) => setShowroomForm({ ...showroomForm, codes: e.target.value.toUpperCase() })}
            />

            <input
              placeholder="Texto opcional. Ej: Nuevas piezas disponibles esta semana"
              value={showroomForm.description}
              disabled={showroomForm.uploading}
              onChange={(e) => setShowroomForm({ ...showroomForm, description: e.target.value })}
            />

            <input
              type="file"
              accept="image/*"
              disabled={showroomForm.uploading}
              onChange={(e) => setShowroomForm({ ...showroomForm, imageFile: e.target.files[0] })}
            />

            <button
              className="pink-btn"
              style={{ width: "100%" }}
              onClick={saveShowroomArrival}
              disabled={showroomForm.uploading}
            >
              {showroomForm.uploading ? "Subiendo showroom..." : "Guardar showroom"}
            </button>

            <div className="admin-review-list" style={{ marginTop: "16px" }}>
              {showroomItems.length === 0 ? (
                <div className="bulk-note">Todavía no hay imágenes en showroom.</div>
              ) : (
                showroomItems.map((item) => (
                  <div className="admin-review-item" key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.codes}</p>
                    {item.description && <p>{item.description}</p>}
                    <img src={item.image_url} alt={item.title} className="review-media" />
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
                      <img src={review.media_url} alt="Reseña" className="review-media" />
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

      <footer className="footer">
        <span>✨ Aquí empieza tu camino para emprender</span>
      </footer>
    </div>
  );
}