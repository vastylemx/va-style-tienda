import { useEffect, useMemo, useRef, useState } from "react";
import { publicSupabase } from "./supabase";
import { getCommunityVideoMime, isCommunityVideo, logCommunityMediaEvent, resolveCommunityMediaUrl } from "./communityMedia";
import WhatsAppAdvisorLink from "./WhatsAppAdvisorLink";
import "./home-experience.css";

const FALLBACK_SECTIONS = [
  { section_key: "hero", title: "Hero", visibility_mode: "active", display_order: 10 },
  { section_key: "categories", title: "Categorías destacadas", visibility_mode: "active", display_order: 20 },
  { section_key: "new_arrivals", title: "Novedades", visibility_mode: "automatic", display_order: 30, item_limit: 8 },
  { section_key: "reviews", title: "Lo que dicen nuestras clientas", visibility_mode: "automatic", display_order: 35, item_limit: 3 },
  { section_key: "upcoming", title: "Disponible próximamente", visibility_mode: "automatic", display_order: 40, item_limit: 8 },
  { section_key: "community", title: "Comunidad", visibility_mode: "automatic", display_order: 80, item_limit: 2 },
  { section_key: "trust", title: "Compra con confianza", visibility_mode: "active", display_order: 90 },
];

const ICONS = {
  bag: <><path d="M6.5 8.5h11l1 12h-13l1-12Z" /><path d="M9 9V6.5a3 3 0 0 1 6 0V9" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
};

function Icon({ name, size = 22 }) {
  return <svg className="ve-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{ICONS[name]}</svg>;
}

function isCurrent(item) {
  const now = Date.now();
  const start = item?.start_at ? new Date(item.start_at).getTime() : -Infinity;
  const end = item?.end_at ? new Date(item.end_at).getTime() : Infinity;
  return (Number.isNaN(start) || start <= now) && (Number.isNaN(end) || end >= now);
}

function captureCommunityVideoPoster(video) {
  const width = Number(video?.videoWidth) || 0;
  const height = Number(video?.videoHeight) || 0;
  if (!width || !height) return "";

  try {
    const maximumWidth = 720;
    const scale = Math.min(1, maximumWidth / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[CommunityMedia] No fue posible capturar el poster:", error);
    return "";
  }
}

function Header({ cartCount, onCart, onMenu, onHome, onAdminAccess }) {
  const [adminPressing, setAdminPressing] = useState(false);
  const adminPressTimerRef = useRef(null);
  const adminPressCompletedRef = useRef(false);

  useEffect(() => () => {
    if (adminPressTimerRef.current) window.clearTimeout(adminPressTimerRef.current);
  }, []);

  function cancelAdminPress() {
    if (adminPressTimerRef.current) {
      window.clearTimeout(adminPressTimerRef.current);
      adminPressTimerRef.current = null;
    }
    setAdminPressing(false);
  }

  function startAdminPress(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cancelAdminPress();
    adminPressCompletedRef.current = false;
    setAdminPressing(true);
    adminPressTimerRef.current = window.setTimeout(() => {
      adminPressTimerRef.current = null;
      adminPressCompletedRef.current = true;
      setAdminPressing(false);
      if (typeof navigator.vibrate === "function") navigator.vibrate(30);
      onAdminAccess();
    }, 3000);
  }

  function handleWordmarkClick(event) {
    if (adminPressCompletedRef.current) {
      event.preventDefault();
      adminPressCompletedRef.current = false;
      return;
    }
    onHome();
  }

  return (
    <header className="ve-header">
      <button className="ve-icon-button ve-menu-button" onClick={onMenu} aria-label="Abrir menú">
        <span /><span />
      </button>
      <button
        className={`ve-wordmark${adminPressing ? " is-admin-pressing" : ""}`}
        onClick={handleWordmarkClick}
        onPointerDown={startAdminPress}
        onPointerUp={cancelAdminPress}
        onPointerCancel={cancelAdminPress}
        onContextMenu={(event) => event.preventDefault()}
        aria-label="Ir al inicio"
      >
        V <i>&amp;</i> A <b>STYLE</b>
        <span className="ve-admin-press-indicator" aria-hidden="true" />
      </button>
      <div className="ve-header-actions">
        <WhatsAppAdvisorLink screen="header" className="whatsapp-advisor-cta--header" label="Asesor" />
        <button className="ve-icon-button" onClick={onCart} aria-label={`Abrir carrito, ${cartCount} piezas`}>
          <Icon name="bag" />
          {cartCount > 0 && <span className="ve-cart-count">{cartCount > 99 ? "99+" : cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

function FullScreenMenu({ open, onClose, categories, onCategory, onSearch, onCommunity, onFavorites, onContact, onPolicies }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    document.body.classList.add("ve-menu-open");
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("ve-menu-open");
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div className={`ve-menu-overlay${open ? " is-open" : ""}`} aria-hidden={!open} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ve-menu-panel" role="dialog" aria-modal="true" aria-label="Menú principal">
        <div className="ve-menu-top">
          <span className="ve-menu-kicker">V &amp; A STYLE</span>
          <button ref={closeRef} className="ve-icon-button" onClick={onClose} aria-label="Cerrar menú"><Icon name="close" /></button>
        </div>
        <nav className="ve-menu-nav" aria-label="Categorías">
          {categories.map((category) => (
            <button key={category} onClick={() => { onCategory(category); onClose(); }}>{category.toUpperCase()}</button>
          ))}
        </nav>
        <nav className="ve-menu-secondary" aria-label="Más opciones">
          <button onClick={() => { onSearch(); onClose(); }}>🔍 BUSCAR PRODUCTOS</button>
          <button onClick={() => { onCommunity(); onClose(); }}>COMUNIDAD</button>
          <button onClick={() => { onFavorites(); onClose(); }}>FAVORITOS</button>
          <button onClick={() => { onContact(); onClose(); }}>CONTACTO</button>
          <button onClick={() => { onPolicies(); onClose(); }}>POLÍTICAS</button>
        </nav>
        <p>León, Guanajuato · Envíos a todo México</p>
      </aside>
    </div>
  );
}

function Hero({ banners, fallback, onNavigate }) {
  const [active, setActive] = useState(0);
  const touch = useRef(null);
  useEffect(() => {
    if (banners.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % banners.length), 5500);
    return () => window.clearInterval(timer);
  }, [banners.length]);
  const slides = banners.length ? banners : [fallback];
  return (
    <section className="ve-hero" aria-roledescription="carrusel" aria-label="Colecciones destacadas"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null || slides.length < 2) return;
        const delta = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(delta) > 45) setActive((active + (delta < 0 ? 1 : slides.length - 1)) % slides.length);
        touch.current = null;
      }}>
      {slides.map((banner, index) => (
        <article key={banner.id || index} className={`ve-hero-slide${index === active ? " is-active" : ""}`} aria-hidden={index !== active}>
          <picture>
            {banner.mobile_image_url && <source media="(max-width: 640px)" srcSet={banner.mobile_image_url} />}
            <img src={banner.image_url} alt={banner.alt_text || ""} fetchPriority={index === 0 ? "high" : "auto"} loading={index === 0 ? "eager" : "lazy"} />
          </picture>
          <div className={`ve-hero-copy ve-copy-${banner.text_position || "left"}`}>
            <span>{banner.eyebrow || "COLECCIÓN V & A"}</span>
            <h1>{banner.title}</h1>
            {banner.subtitle && <p>{banner.subtitle}</p>}
            {banner.button_text && <button onClick={() => onNavigate(banner)}>{banner.button_text}<Icon name="arrow" size={18} /></button>}
          </div>
        </article>
      ))}
      {slides.length > 1 && (
        <div className="ve-hero-dots" aria-label="Elegir banner">
          {slides.map((banner, index) => <button key={banner.id || index} className={index === active ? "is-active" : ""} onClick={() => setActive(index)} aria-label={`Mostrar banner ${index + 1}`} />)}
        </div>
      )}
    </section>
  );
}

function FeaturedCategories({ items, onCategory, onAll, title = "Compra por categoría", showViewAll = true, limit = 5 }) {
  if (!items.length) return null;
  return (
    <section className="ve-section ve-categories" aria-labelledby="featured-categories-title">
      <div className="ve-section-heading">
        <div><span>DESCUBRE</span><h2 id="featured-categories-title">{title}</h2></div>
        {showViewAll && <button onClick={onAll}>VER TODO <Icon name="arrow" size={16} /></button>}
      </div>
      <div className="ve-category-grid">
        {items.slice(0, limit).map((item) => (
          <button key={item.category_name} className="ve-category-card" onClick={() => onCategory(item.category_name)}>
            <img src={item.image_url} alt={item.alt_text || `Colección ${item.category_name}`} loading="lazy" />
            <span>{item.category_name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductRail({ title, eyebrow, products, onProduct, onAll, upcoming = false, showViewAll = true }) {
  if (!products.length) return null;
  return (
    <section className="ve-section ve-product-section">
      <div className="ve-section-heading">
        <div><span>{eyebrow}</span><h2>{title}</h2></div>
        {showViewAll && <button onClick={onAll}>VER TODO <Icon name="arrow" size={16} /></button>}
      </div>
      <div className="ve-product-rail">
        {products.map((product) => (
          <button className="ve-product-card" key={product.id} onClick={() => onProduct(product)}>
            <div className="ve-product-image">
              <img src={product.image} alt={product.name} loading="lazy" />
              <span>{upcoming ? "PREVENTA" : "NUEVO"}</span>
            </div>
            <strong>{product.name}</strong>
            {product.brand && <small>{product.brand}</small>}
            <b>${Number(product.price || 0).toLocaleString("es-MX")} MXN</b>
            {upcoming && product.available_at && <em>Disponible a partir del {new Date(product.available_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function TrustBenefits() {
  return (
    <section className="ve-trust" aria-label="Beneficios de compra">
      {[
        ["MX", "Envíos a todo México", "Desde nuestra tienda en León"],
        ["◇", "Compra con confianza", "Atención durante tu pedido"],
        ["↺", "Pedido garantizado", "Acompañamiento personalizado"],
        ["WA", "Atención por WhatsApp", "Asesoría directa de ventas"],
      ].map(([icon, title, text]) => <div key={title}><i>{icon}</i><span><strong>{title}</strong><small>{text}</small></span></div>)}
    </section>
  );
}

function CommunityPreview({ posts, onAll, title = "Comunidad", showViewAll = true, limit = 2 }) {
  const [failedMedia, setFailedMedia] = useState(() => new Set());
  const [loadedMedia, setLoadedMedia] = useState(() => new Set());
  const [videoPosters, setVideoPosters] = useState({});
  if (!posts.length) return null;
  return (
    <section className="ve-section ve-community" aria-labelledby="community-title">
      <div className="ve-section-heading">
        <div><span>V &amp; A STYLE</span><h2 id="community-title">{title}</h2></div>
        {showViewAll && <button onClick={onAll}>VER TODO <Icon name="arrow" size={16} /></button>}
      </div>
      <div className="ve-community-grid">
        {posts.slice(0, limit).map((post) => {
          const postKey = String(post.id);
          const mediaUrl = resolveCommunityMediaUrl(publicSupabase, post.media_url);
          const isVideo = isCommunityVideo(post);
          const markLoaded = (eventName) => {
            logCommunityMediaEvent(post, mediaUrl, eventName);
            setLoadedMedia((current) => new Set(current).add(postKey));
          };
          const markFailed = (mediaError, mediaElement) => {
            logCommunityMediaEvent(post, mediaUrl, "error", mediaError);
            console.error("No fue posible cargar el contenido visual de Comunidad:", {
              postId: post.id,
              url: mediaUrl,
              errorCode: mediaError?.code || null,
              networkState: mediaElement?.networkState ?? null,
              readyState: mediaElement?.readyState ?? null,
              mimeType: isVideo ? getCommunityVideoMime(mediaUrl) : "image",
            });
            setFailedMedia((current) => new Set(current).add(postKey));
          };
          const markVideoReady = (video, eventName) => {
            const generatedPoster = videoPosters[postKey] || captureCommunityVideoPoster(video);
            if (generatedPoster && !videoPosters[postKey]) {
              setVideoPosters((current) => ({ ...current, [postKey]: generatedPoster }));
            }
            logCommunityMediaEvent(post, mediaUrl, eventName);
            setLoadedMedia((current) => new Set(current).add(postKey));
          };
          return (
          <article
            key={post.id}
            className={`ve-community-card${!mediaUrl ? " is-text-only" : ""}`}
            role="link"
            tabIndex={0}
            onClick={onAll}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onAll();
              }
            }}
          >
            {mediaUrl && !failedMedia.has(postKey) && (
              <div className={`ve-community-media${loadedMedia.has(postKey) ? " is-loaded" : " is-loading"}`}>
                {!loadedMedia.has(postKey) && <div className="ve-community-media-loading" aria-label="Cargando contenido visual" />}
                {isVideo ? (
                  <video
                    crossOrigin="anonymous"
                    poster={videoPosters[postKey] || undefined}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                      logCommunityMediaEvent(post, mediaUrl, "loadedmetadata");
                      if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) {
                        try { event.currentTarget.currentTime = Math.min(0.05, event.currentTarget.duration); } catch { /* Safari puede impedir seek antes de loadeddata. */ }
                      }
                    }}
                    onLoadedData={(event) => markVideoReady(event.currentTarget, "loadeddata")}
                    onCanPlay={(event) => markVideoReady(event.currentTarget, "canplay")}
                    onPlaying={() => markLoaded("playing")}
                    onError={(event) => markFailed(event.currentTarget.error, event.currentTarget)}
                  >
                    <source src={mediaUrl} type={getCommunityVideoMime(mediaUrl)} />
                  </video>
                ) : (
                  <img
                    src={mediaUrl}
                    alt={post.text ? `Publicación: ${post.text.slice(0, 70)}` : "Publicación de la comunidad V & A Style"}
                    loading="eager"
                    decoding="async"
                    onLoad={() => markLoaded("load")}
                    onError={(event) => markFailed(null, event.currentTarget)}
                  />
                )}
              </div>
            )}
            {mediaUrl && failedMedia.has(postKey) && <div className="ve-community-media-error" role="status">Contenido visual no disponible</div>}
            <span>
              <strong>{post.text || "Descubre lo nuevo en nuestra comunidad."}</strong>
              <small>♡ {Number(post.likes_count || 0).toLocaleString("es-MX")}</small>
            </span>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function HomeReviews({ reviews, onAll, limit = 3, title = "Lo que dicen nuestras clientas", showViewAll = true }) {
  if (!reviews.length) return null;
  const average = reviews.reduce((sum, review) => sum + Math.min(5, Math.max(1, Number(review.rating) || 5)), 0) / reviews.length;
  return (
    <section className="ve-section ve-home-reviews" aria-labelledby="home-reviews-title">
      <div className="ve-section-heading">
        <div><span>OPINIONES</span><h2 id="home-reviews-title">{title}</h2></div>
        {showViewAll && <button onClick={onAll}>VER TODAS <Icon name="arrow" size={16} /></button>}
      </div>
      <div className="ve-review-summary"><strong>{average.toFixed(1)} <i>★</i></strong><span>Basado en {reviews.length} {reviews.length === 1 ? "reseña" : "reseñas"}</span></div>
      <div className="ve-home-review-list">
        {reviews.slice(0, limit).map((review) => (
          <article key={review.id}>
            <div><span>{"★".repeat(Math.min(5, Math.max(1, Number(review.rating) || 5)))}</span><time dateTime={review.created_at || undefined}>{review.created_at ? new Date(review.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : ""}</time></div>
            <p>“{review.comment}”</p>
            <strong>{review.customer_name || "Cliente V & A"}</strong>
          </article>
        ))}
      </div>
      {showViewAll && <button className="ve-home-reviews-all" type="button" onClick={onAll}>VER TODAS LAS RESEÑAS <Icon name="arrow" size={16} /></button>}
    </section>
  );
}

export function BoutiqueFooter({ onCommunity, onCollections, onReviews, onContact, onPolicies, onInstall }) {
  return (
    <footer className="ve-footer" id="contacto">
      <div className="ve-footer-brand"><strong>V <i>&amp;</i> A STYLE</strong><p>Accesorios seleccionados para emprender, regalar y hacerlos tuyos.</p></div>
      <div className="ve-footer-explore"><b>EXPLORA</b><button onClick={onCommunity}>Comunidad <span>→</span></button><button onClick={onCollections}>Colecciones <span>→</span></button><button onClick={onReviews}>Reseñas <span>→</span></button></div>
      <div id="politicas"><b>AYUDA</b><button onClick={onContact}>Contacto</button><button onClick={onPolicies}>Políticas</button><button onClick={onInstall}>Instalar app</button></div>
      <small>© {new Date().getFullYear()} V &amp; A Style. Todos los derechos reservados.</small>
    </footer>
  );
}

export default function HomeExperience({ products, reviews = [], homeSettings, cartCount, showContent = true, onHome, onCart, onSearch, onCategory, onProduct, onNewArrivals, onCommunity, onReviews, onFavorites, onContact, onPolicies, onAdminAccess }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [config, setConfig] = useState({ banners: [], featured: [], sections: FALLBACK_SECTIONS });
  const [communityPosts, setCommunityPosts] = useState([]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  useEffect(() => {
    let active = true;
    Promise.all([
      publicSupabase.from("home_banners").select("*").eq("is_active", true).order("display_order"),
      publicSupabase.from("featured_categories").select("*").eq("is_active", true).order("display_order"),
      publicSupabase.from("home_sections").select("*").order("display_order"),
    ]).then(([banners, featured, sections]) => {
      if (!active) return;
      setConfig({
        banners: (banners.data || []).filter(isCurrent),
        featured: (featured.data || []).filter(isCurrent),
        sections: sections.error ? FALLBACK_SECTIONS : (sections.data || []),
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showContent) return;
    let active = true;
    publicSupabase
      .from("community_posts")
      .select("id,media_url,media_type,text,likes_count,is_pinned,created_at")
      .eq("active", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2)
      .then(async ({ data, error }) => {
        if (error && String(error.message || "").includes("is_pinned")) {
          const fallback = await publicSupabase
            .from("community_posts")
            .select("id,media_url,media_type,text,likes_count,created_at")
            .eq("active", true)
            .order("created_at", { ascending: false })
            .limit(2);
          if (active) setCommunityPosts(fallback.data || []);
          return;
        }
        if (active) setCommunityPosts(data || []);
      });
    return () => { active = false; };
  }, [showContent]);

  const fallbackHero = {
    image_url: homeSettings.hero_image_url,
    title: homeSettings.hero_title,
    subtitle: homeSettings.hero_subtitle,
    button_text: "DESCUBRIR COLECCIÓN",
  };
  const imageFallbacks = [homeSettings.new_arrivals_image_url, homeSettings.best_sellers_image_url, homeSettings.hero_image_url].filter(Boolean);
  const featured = config.featured.length ? config.featured.map((item) => ({
    ...item,
    category_name: item.category_name || item.category,
  })) : categories.slice(0, 4).map((name, index) => ({
    category_name: name,
    image_url: products.find((p) => p.category === name)?.image || imageFallbacks[index % Math.max(imageFallbacks.length, 1)],
  })).filter((item) => item.image_url);
  const newProducts = products.filter((p) => p.isNewArrival || p.is_new_arrival).slice(0, 8);
  const upcoming = products.filter((p) => p.available_at && new Date(p.available_at) > new Date()).slice(0, 8);
  const sections = [...config.sections].filter((s) => s.is_active !== false && s.visibility_mode !== "inactive" && isCurrent(s)).sort((a, b) => a.display_order - b.display_order);

  function navigateBanner(banner) {
    const type = String(banner?.destination_type || "").toLowerCase();
    const value = String(banner?.destination_value || "").trim();
    if (type === "category" && value) return onCategory(value);
    if (type === "reviews") return onReviews();
    if (type === "community") return onCommunity();
    if (type === "url" && /^https?:\/\//i.test(value)) {
      window.location.assign(value);
      return;
    }
    onNewArrivals();
  }

  return (
    <>
      <Header cartCount={cartCount} onHome={onHome} onCart={onCart} onMenu={() => setMenuOpen(true)} onAdminAccess={onAdminAccess} />
      <FullScreenMenu open={menuOpen} onClose={() => setMenuOpen(false)} categories={categories} onCategory={onCategory} onSearch={onSearch} onCommunity={onCommunity} onFavorites={onFavorites} onContact={onContact} onPolicies={onPolicies} />
      {showContent && sections.map((section) => {
        if (section.section_key === "hero") return <Hero key="hero" banners={config.banners.slice(0, section.item_limit || 5)} fallback={fallbackHero} onNavigate={navigateBanner} />;
        if (section.section_key === "categories") return <FeaturedCategories key="categories" items={featured} title={section.title || "Compra por categoría"} showViewAll={section.show_view_all} limit={section.item_limit || 5} onCategory={onCategory} onAll={() => setMenuOpen(true)} />;
        if (section.section_key === "new_arrivals") return <ProductRail key="new" eyebrow="RECIÉN LLEGADO" title={section.title || "Novedades"} showViewAll={section.show_view_all} products={newProducts.slice(0, section.item_limit || 8)} onProduct={onProduct} onAll={onNewArrivals} />;
        if (section.section_key === "reviews") return <HomeReviews key="reviews" reviews={reviews} title={section.title || "Lo que dicen nuestras clientas"} showViewAll={section.show_view_all} limit={section.item_limit || 3} onAll={onReviews} />;
        if (section.section_key === "upcoming") return <ProductRail key="upcoming" upcoming eyebrow="PRÓXIMAMENTE" title={section.title || "Disponible próximamente"} showViewAll={section.show_view_all} products={upcoming.slice(0, section.item_limit || 8)} onProduct={onProduct} onAll={onNewArrivals} />;
        if (section.section_key === "community") return <CommunityPreview key="community" posts={communityPosts} title={section.title || "Comunidad"} showViewAll={section.show_view_all} limit={section.item_limit || 2} onAll={onCommunity} />;
        if (section.section_key === "trust") return <TrustBenefits key="trust" />;
        return null;
      })}
    </>
  );
}
