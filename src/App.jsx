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
];

export default function App() {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("Bolsas");
  const [cart, setCart] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });

  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const lastTapRef = useRef(0);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const ADMIN_PASSWORD = "vanda2025";

  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Bolsas",
    precio_mayorista: "",
    imageFile: null,
    image_url: "",
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "auto";
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
        category: p.category,
        price: Number(p.wholesale_price) || 0,
        image: p.image_url,
      }))
    );
  }

  const filtered =
    category === "Todas"
      ? products
      : products.filter((p) => p.category === category);

  const total = cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  function addToCart(product) {
    setCart((prevCart) => [
      ...prevCart,
      {
        ...product,
        price: Number(product.price) || 0,
      },
    ]);
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
      setImageZoom(2.5);
    } else {
      setImageZoom(1);
      setImagePosition({ x: 0, y: 0 });
    }
  }

  function getDistance(touch1, touch2) {
    const x = touch1.clientX - touch2.clientX;
    const y = touch1.clientY - touch2.clientY;
    return Math.sqrt(x * x + y * y);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      pinchRef.current = {
        distance: getDistance(e.touches[0], e.touches[1]),
        zoom: imageZoom,
      };
    }

    if (e.touches.length === 1) {
      dragRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        startX: imagePosition.x,
        startY: imagePosition.y,
      };
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();

      const newDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = newDistance / pinchRef.current.distance;
      const nextZoom = Math.min(Math.max(pinchRef.current.zoom * scale, 1), 4);

      setImageZoom(nextZoom);

      if (nextZoom === 1) {
        setImagePosition({ x: 0, y: 0 });
      }
    }

    if (e.touches.length === 1 && dragRef.current && imageZoom > 1) {
      e.preventDefault();

      const deltaX = e.touches[0].clientX - dragRef.current.x;
      const deltaY = e.touches[0].clientY - dragRef.current.y;

      setImagePosition({
        x: dragRef.current.startX + deltaX,
        y: dragRef.current.startY + deltaY,
      });
    }
  }

  function handleTouchEnd() {
    const now = Date.now();

    if (now - lastTapRef.current < 280) {
      toggleZoom();
    }

    lastTapRef.current = now;
    dragRef.current = null;
    pinchRef.current = null;
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

  function startEditProduct(product) {
    setEditingProduct(product);

    setNewProduct({
      name: product.name,
      category: product.category,
      precio_mayorista: product.price,
      imageFile: null,
      image_url: product.image,
    });

    setShowAdmin(true);
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
      const file = newProduct.imageFile;
      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);

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
          category: newProduct.category,
          wholesale_price: Number(newProduct.precio_mayorista),
          image_url: publicUrl,
        })
        .eq("id", editingProduct.id);

      error = result.error;
    } else {
      const result = await supabase.from("products").insert([
        {
          name: newProduct.name.trim().toUpperCase(),
          category: newProduct.category,
          wholesale_price: Number(newProduct.precio_mayorista),
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
      category: "Bolsas",
      precio_mayorista: "",
      imageFile: null,
      image_url: "",
    });

    setEditingProduct(null);
    fetchProducts();
  }

  async function sendWhatsApp() {
    if (cart.length < 6) {
      alert("Pedido mínimo: 6 piezas.");
      return;
    }

    const customerName = prompt("Nombre del cliente:");
    if (!customerName) return;

    const customerWhatsapp = prompt("WhatsApp del cliente:");
    if (!customerWhatsapp) return;

    const whatsappNumbers = ["524779177633", "524821357950"];

const { data: nextIndex, error: rotationError } = await supabase.rpc(
  "get_next_whatsapp_index",
  { total_numbers: whatsappNumbers.length }
);

if (rotationError) {
  alert("Error asignando asesor. Intenta de nuevo.");
  console.log(rotationError);
  return;
}

const selectedNumber = whatsappNumbers[nextIndex];

    const productsText = cart
      .map(
        (item, index) =>
          `${index + 1}. ${item.name} - $${(Number(item.price) || 0).toLocaleString()} MXN`
      )
      .join("\n");

    const message = `
Hola, quiero hacer este pedido en V & A Style

DATOS DEL CLIENTE
Nombre: ${customerName}
WhatsApp: ${customerWhatsapp}

PEDIDO
${productsText}

TOTAL: $${total.toLocaleString()} MXN

Gracias
`;

    const encodedMessage = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${selectedNumber}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${selectedNumber}?text=${encodedMessage}`;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      window.location.href = appUrl;

      setTimeout(() => {
        window.location.href = webUrl;
      }, 1200);
    } else {
      window.open(webUrl, "_blank");
    }
  }

  function openLink(url) {
    window.open(url, "_blank");
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
          color: #d66176;
          border-bottom: 3px solid #d66176;
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
          background: #d76578;
          color: white;
        }

        .cart-btn {
          background: white;
          border: 1px solid #caa27b;
          color: #8b633e;
        }

        .hero {
          text-align: center;
          padding: 18px 14px 12px;
          background: linear-gradient(90deg,#fff4ea,#ffe2dd,#fff3e8);
          border-bottom: 1px solid #f1d7cb;
        }

        .hero h1 {
          font-family: Georgia, serif;
          font-size: 42px;
          font-weight: 400;
          margin: 0;
          color: #7a4050;
        }

        .hero p {
          margin: 10px auto 0;
          max-width: 700px;
          font-size: 17px;
          line-height: 1.5;
          color: #6b5550;
        }

        .main {
          display: grid;
          grid-template-columns: 1fr 330px;
          gap: 34px;
          padding: 24px 38px 80px;
        }

        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 13px;
          margin-bottom: 22px;
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
          background: #d76578;
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
        }

        .card-body {
          padding: 10px 13px 13px;
        }

        .card-body h3 {
          margin: 0 0 5px;
          font-size: 15px;
          line-height: 1.2;
        }

        .price {
          color: #d76578;
          font-weight: 800;
          margin-bottom: 9px;
        }

        .add {
          width: 100%;
          background: #d76578;
          color: white;
          padding: 12px;
          border-radius: 6px;
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

        .minimum-order {
          font-size: 13px;
          color: #9b6a5f;
          font-weight: 700;
          margin-top: 8px;
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
          margin: 0 38px 80px;
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
          background: #d76578;
          color: white;
          padding: 13px 14px;
          border-radius: 999px;
          text-align: center;
          font-weight: 800;
          box-shadow: 0 6px 16px rgba(120,70,60,.13);
        }

        .social-btn {
          background: #fff4ea;
          color: #7a4050;
          border: 1px solid #eadbd3;
        }

        .footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #f4e1cd;
          display: flex;
          justify-content: space-around;
          padding: 7px 8px;
          color: #7a5c50;
          font-size: 11px;
          border-top: 1px solid #e7cdb7;
          z-index: 50;
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
          touch-action: none;
          cursor: grab;
        }

        .image-modal-img {
          max-width: 96vw;
          max-height: 84vh;
          object-fit: contain;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
          transition: transform .12s ease-out;
          cursor: zoom-in;
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

        .zoom-hint {
          position: fixed;
          top: 18px;
          left: 18px;
          color: rgba(255,255,255,.88);
          font-size: 12px;
          font-weight: 700;
          background: rgba(0,0,0,.35);
          padding: 8px 11px;
          border-radius: 999px;
          z-index: 2100;
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
            padding: 10px 10px 9px;
          }

          .hero h1 {
            font-size: 24px;
            line-height: 1.1;
          }

          .hero p {
            font-size: 13px;
            line-height: 1.3;
            margin-top: 5px;
          }

          .main {
            display: flex;
            flex-direction: column;
            padding: 11px 10px 84px;
            gap: 16px;
          }

          .filters {
            gap: 7px;
            margin-bottom: 12px;
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

          .admin-box {
            padding: 13px;
          }

          .info-section {
            margin: 0 10px 78px;
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
            font-size: 9px;
            gap: 4px;
            flex-wrap: wrap;
            padding: 4px 4px;
          }

          .floating-cart {
            display: flex;
            position: fixed;
            right: 16px;
            bottom: 42px;
            width: 58px;
            height: 58px;
            border-radius: 999px;
            background: #d76578;
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

          .zoom-hint {
            font-size: 11px;
            max-width: 210px;
          }
        }
      `}</style>

      <header className="navbar">
        <div className="logo-wrap">
          <button
            className="admin-secret"
            onClick={() => {
              const password = prompt("Contraseña admin");
              if (password === ADMIN_PASSWORD) {
                setShowAdmin(!showAdmin);
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
          <button className="cart-btn top-cart">🛒 Carrito ({cart.length})</button>
        </div>
      </header>

      <section className="hero">
        <h1>Bienvenida a V & A Style ✨</h1>
        <p>Catálogo exclusivo de bolsas estilo diseñador</p>
        <p>Modelos premium disponibles ✨</p>
      </section>

      <main className="main">
        <section>
          <div className="filters">
            {categories.map((cat) => (
              <button
                key={cat}
                className={category === cat ? "filter active" : "filter"}
                onClick={() => setCategory(cat)}
              >
                {cat === "Todas" ? "🎁 Todas" : `👜 ${cat}`}
              </button>
            ))}
          </div>

          <div className="grid">
            {filtered.map((p) => (
              <div className="card" key={p.id}>
                <img
                  src={p.image}
                  alt={p.name}
                  onClick={() => openImage(p)}
                />

                <div className="card-body">
                  <h3>{p.name}</h3>
                  <div className="price">${(Number(p.price) || 0).toLocaleString()} MXN</div>

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
        </section>

        <aside className="side">
          <div className="box">
            <div className="box-header">
              <span>🛒 Tu carrito</span>
              <button className="cart-btn" onClick={() => setCart([])}>×</button>
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
                      {item.name} — ${(Number(item.price) || 0).toLocaleString()} MXN
                    </div>
                  ))}

                  <h3>Total: ${total.toLocaleString()} MXN</h3>

                  {cart.length < 6 && (
                    <p className="minimum-order">
                      Pedido mínimo: 6 piezas. Agrega {6 - cart.length} más.
                    </p>
                  )}

                  <button className="pink-btn" onClick={sendWhatsApp}>
                    WhatsApp Enviar pedido
                  </button>
                </>
              )}
            </div>
          </div>

          {showAdmin && (
            <div className="box admin-box">
              <h3>{editingProduct ? "✏️ Editar producto" : "🔒 Panel admin"}</h3>

              <input
                placeholder="Nombre del producto"
                value={newProduct.name}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    name: e.target.value.toUpperCase(),
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
          )}
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
            Escríbenos directamente con cualquiera de nuestros asesores o síguenos
            en redes sociales para conocer nuestras novedades.
          </p>

          <div className="contact-buttons">
            <button
              className="contact-btn"
              onClick={() => openLink("https://wa.me/524821357950")}
            >
              Asesor 1
            </button>

            <button
              className="contact-btn"
              onClick={() => openLink("https://wa.me/524779177633")}
            >
              Asesor 2
            </button>

            <button
              className="contact-btn social-btn"
              onClick={() =>
                openLink("https://www.facebook.com/share/1EfzrWvU3m/?mibextid=wwXIfr")
              }
            >
              Facebook
            </button>

            <button
              className="contact-btn social-btn"
              onClick={() =>
                openLink("https://www.instagram.com/v_a_style.mx?igsh=MXdpdXlqOWE3ZGx2ag%3D%3D&utm_source=qr")
              }
            >
              Instagram
            </button>
          </div>
        </div>
      </section>

      {cart.length > 0 && (
        <button
          className="floating-cart"
          onClick={() =>
            document.querySelector(".side").scrollIntoView({
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

          <div className="zoom-hint">
            Doble toque o pellizca para acercar
          </div>

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

      <footer className="footer">
        <span>© 2025 V & A Style</span>
        <span>🚚 Envíos a toda la república</span>
        <span>✨ Aquí empieza tu camino para emprender</span>
      </footer>
    </div>
  );
}