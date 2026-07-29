import { useMemo, useState } from "react";
import WhatsAppAdvisorLink from "./WhatsAppAdvisorLink";
import "./explore-experiences.css";

function ViewHeader({ eyebrow, title, subtitle, onBack }) {
  return (
    <header className="explore-view__heading">
      <button type="button" onClick={onBack} aria-label="Volver al inicio">←</button>
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}

function countModels(items) {
  return new Set(items.map((item) => item.modelCode || String(item.name || "").split("-")[0].trim() || item.id)).size;
}

export function CollectionsExperience({ products, favorites, loading, error, onRetry, onBack, onCategory, onNewArrivals, onUpcoming, onFavorites }) {
  const collections = useMemo(() => {
    const result = [];
    const newProducts = products.filter((product) => product.isNewArrival || product.is_new_arrival);
    if (newProducts.length) result.push({ key: "new", name: "Nueva colección", items: newProducts, action: onNewArrivals });

    [...new Set(products.map((product) => product.category).filter(Boolean))].forEach((category) => {
      const items = products.filter((product) => product.category === category);
      if (items.length) result.push({ key: `category-${category}`, name: category, items, action: () => onCategory(category) });
    });

    const upcoming = products.filter((product) => product.available_at && new Date(product.available_at) > new Date());
    if (upcoming.length) result.push({ key: "upcoming", name: "Disponible próximamente", items: upcoming, action: onUpcoming });

    const favoriteItems = products.filter((product) => favorites.includes(product.id || product.modelCode || product.name));
    if (favoriteItems.length) result.push({ key: "favorites", name: "Favoritos V & A", items: favoriteItems, action: onFavorites });
    return result;
  }, [favorites, onCategory, onFavorites, onNewArrivals, onUpcoming, products]);

  return (
    <main className="explore-view">
      <ViewHeader eyebrow="EXPLORA" title="Colecciones" subtitle="Una selección creada a partir de nuestro catálogo actual." onBack={onBack} />
      {loading ? (
        <div className="explore-empty" role="status"><h2>Preparando colecciones…</h2><p>Estamos organizando el catálogo.</p></div>
      ) : error ? (
        <div className="explore-empty" role="alert"><h2>No pudimos cargar las colecciones</h2><p>{error}</p><button type="button" onClick={onRetry}>REINTENTAR</button></div>
      ) : collections.length ? (
        <div className="collections-grid">
          {collections.map((collection) => (
            <button type="button" className="collection-card" key={collection.key} onClick={collection.action}>
              <img src={collection.items.find((item) => item.image)?.image} alt="" loading="lazy" />
              <span>
                <strong>{collection.name}</strong>
                <small>{countModels(collection.items)} {countModels(collection.items) === 1 ? "modelo" : "modelos"}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="explore-empty">
          <h2>Aún no hay colecciones disponibles</h2>
          <p>Vuelve a intentarlo en unos momentos.</p>
        </div>
      )}
    </main>
  );
}

function ReviewSummary({ reviews }) {
  const average = reviews.length
    ? reviews.reduce((total, review) => total + Math.min(5, Math.max(1, Number(review.rating) || 5)), 0) / reviews.length
    : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => Math.round(Number(review.rating) || 5) === star).length,
  }));

  return (
    <section className="review-summary" aria-label="Resumen de reseñas">
      <div><strong>{average ? average.toFixed(1) : "—"} <i>★</i></strong><span>Basado en {reviews.length} {reviews.length === 1 ? "reseña" : "reseñas"}</span></div>
      <div className="review-distribution">
        {distribution.map(({ star, count }) => (
          <div key={star}><span>{star} ★</span><i><b style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : "0%" }} /></i><small>{count}</small></div>
        ))}
      </div>
    </section>
  );
}

export function ReviewsExperience({ reviews, loading, error, onRetry, onBack }) {
  const [visibleCount, setVisibleCount] = useState(8);
  return (
    <main className="explore-view">
      <ViewHeader eyebrow="EXPERIENCIAS REALES" title="Reseñas" subtitle="Opiniones compartidas por clientes de V & A Style." onBack={onBack} />
      {!loading && !error && <ReviewSummary reviews={reviews} />}
      {loading ? (
        <div className="explore-empty" role="status"><h2>Cargando reseñas…</h2><p>Consultando experiencias aprobadas.</p></div>
      ) : error ? (
        <div className="explore-empty" role="alert"><h2>No pudimos cargar las reseñas</h2><p>{error}</p><button type="button" onClick={onRetry}>REINTENTAR</button></div>
      ) : reviews.length ? (
        <>
          <section className="premium-review-list" aria-label="Reseñas aprobadas">
            {reviews.slice(0, visibleCount).map((review) => (
              <article key={review.id}>
                <div>
                  <span className="premium-review-stars">{"★".repeat(Math.min(5, Math.max(1, Number(review.rating) || 5)))}</span>
                  <time dateTime={review.created_at || undefined}>
                    {review.created_at ? new Date(review.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : ""}
                  </time>
                </div>
                <p>“{review.comment}”</p>
                <strong>{review.customer_name}</strong>
                {review.media_url && review.media_type !== "video" && <img src={review.media_url} alt={`Reseña de ${review.customer_name || "cliente"}`} loading="lazy" />}
                {review.media_url && review.media_type === "video" && <video src={review.media_url} controls preload="metadata" />}
              </article>
            ))}
          </section>
          {visibleCount < reviews.length && <button className="explore-load-more" type="button" onClick={() => setVisibleCount((count) => count + 8)}>VER MÁS RESEÑAS</button>}
        </>
      ) : (
        <div className="explore-empty"><h2>Aún no hay reseñas publicadas</h2><p>Las opiniones aprobadas aparecerán aquí.</p></div>
      )}
    </main>
  );
}

export function InformationExperience({ type, onBack }) {
  const isContact = type === "contact";
  return (
    <main className="explore-view">
      <ViewHeader
        eyebrow={isContact ? "ESTAMOS PARA AYUDARTE" : "INFORMACIÓN DE COMPRA"}
        title={isContact ? "Contacto" : "Políticas"}
        subtitle={isContact ? "Habla directamente con el equipo de V & A Style." : "Información vigente para comprar con claridad y confianza."}
        onBack={onBack}
      />
      <section className="information-view">
        {isContact ? (
          <>
            <div><span>WHATSAPP VENTAS</span><h2>Atención personalizada</h2><p>Consulta disponibilidad, pedidos y envíos con una asesora.</p><WhatsAppAdvisorLink screen="contact" /></div>
            <div><span>TIENDA FÍSICA</span><h2>León, Guanajuato</h2><p>Calle Taxco #140, Colonia El Coecillo, C.P. 37260.</p></div>
          </>
        ) : (
          <>
            <div><span>PEDIDOS</span><h2>Compra acompañada</h2><p>El pedido mínimo vigente es de seis piezas. Tu asesora confirma existencias y acompaña el proceso.</p></div>
            <div><span>ENVÍOS</span><h2>Envíos a todo México</h2><p>El costo se calcula con las reglas actuales del carrito. Los pedidos mayores pueden requerir una cotización directa.</p></div>
            <div><span>ATENCIÓN</span><h2>Dudas o aclaraciones</h2><p>Contacta a ventas por WhatsApp antes de completar tu pedido para recibir la información aplicable.</p></div>
          </>
        )}
      </section>
    </main>
  );
}
