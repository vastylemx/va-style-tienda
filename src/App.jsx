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
  "Tenis",
];

const PRODUCTS_PER_PAGE = 20;

const BETA_MODE = true;
const BETA_WHATSAPP_NUMBER = "524776311393";
const ADVISOR_NUMBERS = ["524779177633", "524821357950"];

const CART_STORAGE_KEY = "vaStyleCart";
const ORDER_SENT_KEY = "vaStyleOrderSent";
const LAST_ADVISOR_KEY = "vaStyleLastAdvisor";
const ADMIN_SESSION_KEY = "vaStyleAdminSession";

function getCleanPrice(value) {
  if (value === null || value === undefined) return 0;

  const cleanValue = String(value)
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "");

  const numberValue = parseFloat(cleanValue);
  return Number.isFinite(numberValue) ? numberValue : 0;
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
  const [category, setCategory] = useState("Bolsas");
  const [cart, setCart] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
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
  const [currentPage, setCurrentPage] = useState(1);
  const [adminModal, setAdminModal] = useState(null);
  const [bulkUpload, setBulkUpload] = useState({
    baseName: "",
    brand: "",
    category: "Bolsas",
    precio_mayorista: "",
    files: [],
    uploading: false,
    progress: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });

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
    precio_mayorista: "",
    imageFile: null,
    image_url: "",
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    setCurrentPage(1);
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
        brand: p.brand || "",
        category: p.category,
        price: Number(p.wholesale_price) || 0,
        image: p.image_url,
      }))
    );
  }

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE;
  const paginatedProducts = filtered.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);

  const total = cart
    .map((item) => getCleanPrice(item.price))
    .reduce((sum, price) => sum + price, 0);

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1800);
  }

  function addToCart(product) {
    setCart((prevCart) => [
      ...prevCart,
      {
        ...product,
        price: getCleanPrice(product.price),
      },
    ]);

    showToast("Producto agregado al carrito ✅");
  }

  function openImage(product) {
    setSelectedProduct(product);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
    document.body.style.overflow = "hidden";
  }

  function closeImage() {
    setSelectedProduct(null);
    setImageZoom(1);
    setImagePosition({ x: 0, y: 0 });
    document.body.style.overflow = "auto";
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
    };
  }

  function handleTouchMove(e) {
    if (!dragRef.current) return;

    dragRef.current.moved = true;
  }

  function handleTouchEnd() {
    const now = Date.now();
    const wasDragging = dragRef.current?.moved;

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
      precio_mayorista: "",
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
      precio_mayorista: product.price,
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
          brand: newProduct.brand.trim(),
          category: newProduct.category,
          wholesale_price: getCleanPrice(newProduct.precio_mayorista),
          image_url: publicUrl,
        })
        .eq("id", editingProduct.id);

      error = result.error;
    } else {
      const result = await supabase.from("products").insert([
        {
          name: newProduct.name.trim().toUpperCase(),
          brand: newProduct.brand.trim(),
          category: newProduct.category,
          wholesale_price: getCleanPrice(newProduct.precio_mayorista),
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
      precio_mayorista: "",
      imageFile: null,
      image_url: "",
    });

    setEditingProduct(null);
    setAdminModal(null);
    fetchProducts();
  }

  async function saveBulkProducts() {
    const baseName = bulkUpload.baseName.trim().toUpperCase();
    const brand = bulkUpload.brand.trim();
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
          wholesale_price: price,
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
      precio_mayorista: "",
      files: [],
      uploading: false,
      progress: "",
    });
    setAdminModal(null);
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

    const productsText = cart
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}${item.brand ? ` / Marca: ${item.brand}` : ""} - $${getCleanPrice(item.price).toLocaleString("es-MX")} MXN`
      )
      .join("\n");

    const message = `
Hola, quiero hacer este pedido en V & A Style

${isAdditionalOrder ? "AGREGADO A PEDIDO ANTERIOR\n" : ""}DATOS DEL CLIENTE
Nombre: ${customerName.trim()}

PEDIDO
${productsText}

TOTAL: $${total.toLocaleString("es-MX")} MXN

Gracias
`;

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
          background: white;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 8px 22px rgba(90,50,30,.12);
          border: 1px solid #f1e4dd;
        }

        .card img {
          width: 100%;
          height: 185px;
          object-fit: cover;
          display: block;
          cursor: zoom-in;
          -webkit-touch-callout: default;
        }

        .card-body {
          padding: 10px 13px 13px;
        }

        .card-body h3 {
          margin: 0 0 5px;
          font-size: 15px;
          line-height: 1.2;
        }

        .brand {
          color: #7a5c50;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .price {
          color: #c94462;
          font-weight: 800;
          margin-bottom: 9px;
        }

        .add {
          width: 100%;
          background: #c94462;
          color: white;
          padding: 12px;
          border-radius: 6px;
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
          padding: 28px 18px;
          text-align: center;
          color: #6f625f;
        }

        .cart-item {
          text-align: left;
          padding: 9px 0;
          border-bottom: 1px solid #f1e5df;
          font-size: 14px;
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
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          overflow: hidden;
        }

        .image-modal-content {
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
          z-index: 2100;
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
            padding: 7px 8px 9px;
          }

          .card-body h3 {
            font-size: 13px;
            margin: 0 0 3px;
            line-height: 1.15;
          }

          .price {
            font-size: 13px;
            margin-bottom: 6px;
          }

          .add,
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
            padding: 16px 12px;
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
          <button className="logout-btn" onClick={closeAdminSession}>🚪 Cerrar sesión admin</button>
        </div>
      )}

      <main className="main">
        <section>
          <div className="filters">
            {categories.map((cat) => (
              <button
                key={cat}
                className={category === cat ? "filter active" : "filter"}
                onClick={() => setCategory(cat)}
              >
                {cat === "Todas" ? "🎁 Todas" : cat === "Tenis" ? "👟 Tenis" : cat === "Hombre" ? "🧔 Hombre" : `👜 ${cat}`}
              </button>
            ))}
          </div>

          <div className="catalog-tools">
            <input
              className="search-input"
              placeholder="🔎 Buscar por código, modelo, marca o categoría"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="results-count">
              {filtered.length} producto{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-results">
              No encontramos productos con esa búsqueda.
            </div>
          ) : (
            <>
              <div className="grid">
                {paginatedProducts.map((p) => (
              <div className="card" key={p.id}>
                <img
                  src={p.image}
                  alt={p.name}
                  onClick={() => openImage(p)}
                />

                <div className="card-body">
                  <h3>{p.name}</h3>
                  {p.brand && <div className="brand">Marca: {p.brand}</div>}
                  <div className="price">${(Number(p.price) || 0).toLocaleString("es-MX")} MXN</div>

                  <button className="add" onClick={() => addToCart(p)}>
                    🛒 Agregar al carrito
                  </button>

                  {showAdmin && (
                    <div style={{ marginTop: "10px" }}>
                      <button
                        className="pink-btn"
                        style={{ width: "100%", marginBottom: "8px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditProduct(p);
                        }}
                      >
                        Editar producto
                      </button>

                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProduct(p.id);
                        }}
                      >
                        Borrar producto
                      </button>
                    </div>
                  )}
                </div>
              </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    ← Anterior
                  </button>

                  <span className="page-info">
                    Página {safeCurrentPage} de {totalPages}
                  </span>

                  <button
                    className="page-btn"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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
                  {cart.map((item, index) => (
                    <div key={index} className="cart-item">
                      {item.name}{item.brand ? ` / Marca: ${item.brand}` : ""} — ${getCleanPrice(item.price).toLocaleString("es-MX")} MXN
                    </div>
                  ))}

                  <div className="cart-total">
                    TOTAL DEL PEDIDO<br />
                    ${Number(total || 0).toLocaleString("es-MX")} MXN
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

      {selectedProduct && (
        <div className="image-modal" onClick={closeImage}>
          <button className="close-modal" onClick={closeImage}>×</button>

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
            {selectedProduct.name}
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
              placeholder="Marca. Ej: Michael Kors, Coach, Nike"
              value={newProduct.brand}
              onChange={(e) =>
                setNewProduct({
                  ...newProduct,
                  brand: e.target.value,
                })
              }
            />

            <select
              value={newProduct.category}
              onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
            >
              <option value="Bolsas">Bolsas</option>
              <option value="Carteras">Carteras</option>
              <option value="Mochilas">Mochilas</option>
              <option value="Crossbody">Crossbody</option>
              <option value="Maleta">Maleta</option>
              <option value="Muñequera">Muñequera</option>
              <option value="Línea económica">Línea económica</option>
              <option value="Hombre">Hombre</option>
              <option value="Tenis">Tenis</option>
            </select>

            <input
              placeholder="Precio mayorista"
              value={newProduct.precio_mayorista}
              onChange={(e) => setNewProduct({ ...newProduct, precio_mayorista: e.target.value })}
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
              placeholder="Marca para este modelo. Ej: Michael Kors"
              value={bulkUpload.brand}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, brand: e.target.value })}
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
              <option value="Tenis">Tenis</option>
            </select>

            <input
              placeholder="Precio mayorista general"
              value={bulkUpload.precio_mayorista}
              disabled={bulkUpload.uploading}
              onChange={(e) => setBulkUpload({ ...bulkUpload, precio_mayorista: e.target.value })}
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

      <footer className="footer">
        <span>✨ Aquí empieza tu camino para emprender</span>
      </footer>
    </div>
  );
}