import { useEffect, useState } from "react";
import { adminFetch } from "./adminApi";
import { supabase } from "./supabase";
import "./home-admin.css";

const EMPTY_BANNER = {
  title: "",
  subtitle: "",
  eyebrow: "",
  image_url: "",
  mobile_image_url: "",
  alt_text: "",
  button_text: "",
  destination_type: "",
  destination_value: "",
  text_position: "left",
  is_active: true,
  display_order: 0,
  start_at: "",
  end_at: "",
};

const EMPTY_CATEGORY = {
  category_name: "",
  image_url: "",
  alt_text: "",
  display_order: 0,
  is_active: true,
  start_at: "",
  end_at: "",
};

const SECTION_NAMES = {
  hero: "Portada principal",
  categories: "Categorías destacadas",
  new_arrivals: "Novedades",
  reviews: "Reseñas",
  upcoming: "Próximamente",
  community: "Comunidad",
  trust: "Beneficios y confianza",
};

function dateInput(value) {
  return value ? String(value).slice(0, 16) : "";
}

function Field({ label, help, children }) {
  return (
    <label className="home-admin-field">
      <span>{label}</span>
      {help && <small>{help}</small>}
      {children}
    </label>
  );
}

function ImageField({ value, onChange, label, help, disabled }) {
  const [uploading, setUploading] = useState(false);

  async function upload(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      alert("La imagen debe ser JPG, PNG o WebP y pesar 10 MB o menos.");
      return;
    }
    setUploading(true);
    try {
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const authorization = await adminFetch("/api/admin/home-upload-url", {
        method: "POST",
        body: JSON.stringify({ extension, contentType: file.type, fileSize: file.size }),
      });
      const { error } = await supabase.storage
        .from("home-media")
        .uploadToSignedUrl(authorization.storagePath, authorization.token, file, { contentType: file.type });
      if (error) throw error;
      onChange(authorization.publicUrl);
    } catch (error) {
      console.error("[HomeAdmin] Error subiendo imagen:", error);
      alert(error.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="home-admin-image-field">
      <strong>{label}</strong>
      {help && <small>{help}</small>}
      {value && <img src={value} alt="Vista previa de la imagen elegida" />}
      <label className="home-admin-upload">
        <span>{uploading ? "Subiendo imagen…" : value ? "Cambiar imagen" : "Elegir imagen"}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={(event) => upload(event.target.files?.[0])} />
      </label>
      <small>JPG, PNG o WebP · máximo 10 MB</small>
      <details className="home-admin-inline-advanced">
        <summary>Usar una imagen alojada en otro sitio</summary>
        <Field label="Dirección de la imagen" help="Pega una dirección segura que comience con https://">
          <input value={value || ""} placeholder="https://…" disabled={disabled || uploading} onChange={(event) => onChange(event.target.value)} />
        </Field>
      </details>
    </div>
  );
}

function AreaHeader({ title, description, onBack }) {
  return (
    <header className="home-admin-heading">
      <button type="button" className="home-admin-back" onClick={onBack}>← Volver al panel</button>
      <span>ADMINISTRACIÓN DE INICIO</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function BannerPreview({ banner, mobile = false }) {
  return (
    <div className={`home-admin-banner-preview${mobile ? " is-mobile" : ""}`}>
      {banner.image_url
        ? <img src={mobile && banner.mobile_image_url ? banner.mobile_image_url : banner.image_url} alt="" />
        : <div className="home-admin-empty-image">La imagen aparecerá aquí</div>}
      <div>
        {banner.eyebrow && <small>{banner.eyebrow}</small>}
        <strong>{banner.title || "Título del banner"}</strong>
        {banner.subtitle && <p>{banner.subtitle}</p>}
        {banner.button_text && <span>{banner.button_text}</span>}
      </div>
    </div>
  );
}

export default function HomeAdmin() {
  const [data, setData] = useState({ sections: [], banners: [], featuredCategories: [], productCategories: [] });
  const [bannerDraft, setBannerDraft] = useState(EMPTY_BANNER);
  const [categoryDraft, setCategoryDraft] = useState(EMPTY_CATEGORY);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [area, setArea] = useState("overview");
  const [bannerStep, setBannerStep] = useState(1);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [homeResult, linesResult] = await Promise.all([
        adminFetch("/api/admin/home-config", { method: "GET" }),
        adminFetch("/api/admin/whatsapp-lines", { method: "GET" }).catch((lineError) => ({
          lines: [],
          warning: lineError.message,
        })),
      ]);
      setData(homeResult);
      setLines(linesResult.lines || []);
      if (linesResult.warning) setMessage(linesResult.warning);
    } catch (loadError) {
      console.error("[HomeAdmin] Error cargando configuración:", loadError);
      setError(loadError.message || "No se pudo cargar la administración de Inicio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // La carga se inicia al montar el panel y actualiza estado al resolver la petición.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function updateCollection(key, id, changes) {
    setData((current) => ({
      ...current,
      [key]: current[key].map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  async function save(entity, item) {
    setBusy(`${entity}-${item.id || "new"}`);
    setError("");
    setMessage("");
    try {
      const result = await adminFetch("/api/admin/home-config", {
        method: "POST",
        body: JSON.stringify({ entity, ...item }),
      });
      const key = entity === "section" ? "sections" : entity === "banner" ? "banners" : "featuredCategories";
      setData((current) => {
        const exists = current[key].some((entry) => entry.id === result.item.id);
        const next = exists
          ? current[key].map((entry) => (entry.id === result.item.id ? result.item : entry))
          : [...current[key], result.item];
        return { ...current, [key]: next.sort((a, b) => a.display_order - b.display_order) };
      });
      if (entity === "banner") setBannerDraft(EMPTY_BANNER);
      if (entity === "category") setCategoryDraft(EMPTY_CATEGORY);
      const visible = result.item?.is_active !== false;
      setMessage(
        entity === "section"
          ? visible ? "La sección se guardó y está disponible para tus clientes." : "La sección quedó oculta. Puedes volver a mostrarla cuando quieras."
          : entity === "banner"
            ? visible ? "El banner ya está publicado en la tienda." : "El banner se guardó como borrador."
            : visible ? "La categoría ya puede aparecer en Inicio." : "La categoría se guardó como borrador."
      );
    } catch (saveError) {
      console.error("[HomeAdmin] Error guardando:", saveError);
      setError(saveError.message || "No se pudo guardar.");
    } finally {
      setBusy("");
    }
  }

  async function remove(entity, id) {
    const noun = entity === "banner" ? "banner" : "categoría destacada";
    if (!window.confirm(`Vas a eliminar este ${noun}. Dejará de aparecer en la tienda y no podrás recuperarlo. ¿Deseas continuar?`)) return;
    setBusy(`${entity}-${id}`);
    try {
      await adminFetch("/api/admin/home-config", {
        method: "DELETE",
        body: JSON.stringify({ entity, id }),
      });
      const key = entity === "banner" ? "banners" : "featuredCategories";
      setData((current) => ({ ...current, [key]: current[key].filter((item) => item.id !== id) }));
      setMessage(`El ${noun} se eliminó correctamente.`);
    } catch (removeError) {
      console.error("[HomeAdmin] Error eliminando:", removeError);
      setError(removeError.message || "No se pudo eliminar.");
    } finally {
      setBusy("");
    }
  }

  async function saveLine(line) {
    setBusy(`line-${line.id}`);
    try {
      const result = await adminFetch("/api/admin/whatsapp-lines", {
        method: "PATCH",
        body: JSON.stringify(line),
      });
      setLines((current) => current.map((item) => (item.id === result.line.id ? result.line : item)));
      setMessage(result.line.is_active
        ? `La Línea ${result.line.id} está activa y recibirá conversaciones.`
        : `La Línea ${result.line.id} fue desactivada temporalmente.`);
    } catch (lineError) {
      console.error("[HomeAdmin] Error guardando línea:", lineError);
      setError(lineError.message || "No se pudo guardar la línea.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="bulk-note">Preparando las opciones de Inicio…</div>;

  function goTo(nextArea) {
    setArea(nextArea);
    setMessage("");
    setError("");
  }

  return (
    <div className="new-home-admin">
      {message && <div className="home-admin-message" role="status">{message}</div>}
      {error && <div className="admin-login-error" role="alert">{error}</div>}

      {area === "overview" && (
        <>
          <header className="home-admin-heading">
            <span>ADMINISTRACIÓN</span>
            <h2>Página de inicio</h2>
            <p>Activa, oculta y ordena el contenido que ven tus clientes. Elige qué deseas cambiar.</p>
          </header>
          <div className="home-admin-menu">
            <button type="button" onClick={() => goTo("sections")}><b>Secciones de Inicio</b><span>Mostrar, ocultar y ordenar cada bloque de la página.</span><em>Administrar →</em></button>
            <button type="button" onClick={() => goTo("banners")}><b>Banners</b><span>Cambiar la imagen principal y destacar promociones o novedades.</span><em>Administrar →</em></button>
            <button type="button" onClick={() => goTo("categories")}><b>Categorías destacadas</b><span>Elegir las categorías que aparecerán primero en la tienda.</span><em>Administrar →</em></button>
            <button type="button" onClick={() => goTo("whatsapp")}><b>Líneas de WhatsApp</b><span>Repartir las conversaciones automáticamente entre las líneas activas.</span><em>Administrar →</em></button>
          </div>
          <aside className="home-admin-next"><strong>Siguiente paso sugerido</strong><p>Revisa la portada y confirma que las secciones importantes estén visibles.</p><button type="button" onClick={() => goTo("sections")}>Revisar secciones</button></aside>
        </>
      )}

      {area === "sections" && (
        <section>
          <AreaHeader title="Secciones de Inicio" description="Activa, oculta y ordena las secciones que ven tus clientes." onBack={() => goTo("overview")} />
          <div className="home-admin-list">
        {data.sections.map((section) => (
          <article className="home-admin-card" key={section.id}>
            <div className="home-admin-card-title"><div><strong>{SECTION_NAMES[section.section_key] || section.title}</strong><small>{section.is_active && section.visibility_mode !== "inactive" ? "Visible para clientes" : "Oculta para clientes"}</small></div><label className="home-admin-switch"><input type="checkbox" checked={section.is_active && section.visibility_mode !== "inactive"} onChange={(event) => updateCollection("sections", section.id, { is_active: event.target.checked, visibility_mode: event.target.checked ? "active" : "inactive" })} /><span />Mostrar esta sección</label></div>
            <Field label="Título que verán tus clientes"><input value={section.title || ""} onChange={(event) => updateCollection("sections", section.id, { title: event.target.value })} /></Field>
            <Field label="Texto de apoyo" help="Opcional. Aparece debajo del título cuando el diseño lo permite."><input placeholder="Escribe una explicación breve" value={section.subtitle || ""} onChange={(event) => updateCollection("sections", section.id, { subtitle: event.target.value })} /></Field>
            <label className="home-admin-check"><input type="checkbox" checked={section.show_view_all} onChange={(event) => updateCollection("sections", section.id, { show_view_all: event.target.checked })} /> Mostrar el enlace “Ver todo”</label>
            <details className="home-admin-advanced">
              <summary>Opciones avanzadas</summary>
              <p>Úsalas solo si deseas programar la sección o ajustar cuántos elementos muestra.</p>
              <Field label="Posición en la página" help="Los números menores aparecen primero."><input type="number" value={section.display_order} onChange={(event) => updateCollection("sections", section.id, { display_order: Number(event.target.value) })} /></Field>
              <Field label="Cantidad máxima de elementos"><input type="number" min="1" max="50" value={section.item_limit} onChange={(event) => updateCollection("sections", section.id, { item_limit: Number(event.target.value) })} /></Field>
              <Field label="Mostrar a partir de"><input type="datetime-local" value={dateInput(section.start_at)} onChange={(event) => updateCollection("sections", section.id, { start_at: event.target.value })} /></Field>
              <Field label="Ocultar después de"><input type="datetime-local" value={dateInput(section.end_at)} onChange={(event) => updateCollection("sections", section.id, { end_at: event.target.value })} /></Field>
            </details>
            <button className="pink-btn" disabled={busy === `section-${section.id}`} onClick={() => save("section", section)}>{busy === `section-${section.id}` ? "Guardando cambios…" : "Guardar cambios"}</button>
          </article>
        ))}
          </div>
        </section>
      )}

      {area === "banners" && (
        <section>
          <AreaHeader title="Banners" description="Cambia la imagen principal y destaca promociones o novedades. Puedes publicar ahora o guardar como borrador." onBack={() => goTo("overview")} />
          <div className="home-admin-list">
        {[...data.banners, bannerDraft].map((banner, index) => {
          const isDraft = !banner.id;
          const setBanner = (changes) => isDraft
            ? setBannerDraft((current) => ({ ...current, ...changes }))
            : updateCollection("banners", banner.id, changes);
          return (
            <article className="home-admin-card" key={banner.id || "new-banner"}>
              <div className="home-admin-card-title"><div><strong>{isDraft ? "Crear un banner" : `Banner ${index + 1}`}</strong><small>{banner.is_active ? "Publicado" : "Borrador"}</small></div>{!isDraft && <button className="home-admin-danger-link" onClick={() => remove("banner", banner.id)}>Eliminar</button>}</div>
              <BannerPreview banner={banner} />
              {isDraft && <div className="home-admin-steps" aria-label={`Paso ${bannerStep} de 4`}><span>Paso {bannerStep} de 4</span><i style={{ width: `${bannerStep * 25}%` }} /></div>}
              {(!isDraft || bannerStep === 1) && <>
                <h3>{isDraft && "Paso 1: Elige una imagen"}</h3>
                <ImageField label="Imagen principal" help="Se verá en computadoras y como respaldo en teléfonos." value={banner.image_url} onChange={(image_url) => setBanner({ image_url })} />
                <ImageField label="Imagen para teléfonos" help="Opcional. Si la omites se usará la imagen principal." value={banner.mobile_image_url} onChange={(mobile_image_url) => setBanner({ mobile_image_url })} />
              </>}
              {(!isDraft || bannerStep === 2) && <>
                <h3>{isDraft && "Paso 2: Agrega el texto"}</h3>
                <Field label="Título"><input placeholder="Ejemplo: Nueva colección" value={banner.title || ""} onChange={(event) => setBanner({ title: event.target.value })} /></Field>
                <Field label="Texto de apoyo" help="Opcional"><input placeholder="Cuenta brevemente qué deseas destacar" value={banner.subtitle || ""} onChange={(event) => setBanner({ subtitle: event.target.value })} /></Field>
                <Field label="Etiqueta pequeña" help="Opcional. Ejemplo: RECIÉN LLEGADO"><input value={banner.eyebrow || ""} onChange={(event) => setBanner({ eyebrow: event.target.value })} /></Field>
              </>}
              {(!isDraft || bannerStep === 3) && <>
                <h3>{isDraft && "Paso 3: Configura el botón"}</h3>
                <Field label="Texto del botón" help="Opcional. Ejemplo: Ver novedades"><input value={banner.button_text || ""} onChange={(event) => setBanner({ button_text: event.target.value })} /></Field>
                <Field label="¿A dónde llevará?"><select value={banner.destination_type || ""} onChange={(event) => setBanner({ destination_type: event.target.value, destination_value: "" })}><option value="">Ir a Novedades</option><option value="category">Ir a una categoría</option><option value="reviews">Ir a Reseñas</option><option value="community">Ir a Comunidad</option><option value="url">Ir a otro sitio</option></select></Field>
                {banner.destination_type === "category" && <Field label="Elegir categoría"><select value={banner.destination_value || ""} onChange={(event) => setBanner({ destination_value: event.target.value })}><option value="">Selecciona una categoría</option>{data.productCategories.map((name) => <option key={name}>{name}</option>)}</select></Field>}
                {banner.destination_type === "url" && <Field label="Dirección de destino"><input placeholder="https://…" value={banner.destination_value || ""} onChange={(event) => setBanner({ destination_value: event.target.value })} /></Field>}
              </>}
              {(!isDraft || bannerStep === 4) && <>
                <h3>{isDraft && "Paso 4: Decide cuándo mostrarlo"}</h3>
                <label className="home-admin-switch"><input type="checkbox" checked={banner.is_active} onChange={(event) => setBanner({ is_active: event.target.checked })} /><span />{banner.is_active ? "Publicar en la tienda" : "Guardar como borrador"}</label>
                <details className="home-admin-advanced"><summary>Opciones avanzadas</summary><p>Programa fechas, cambia la posición del texto o el orden del banner.</p><Field label="Posición del texto"><select value={banner.text_position || "left"} onChange={(event) => setBanner({ text_position: event.target.value })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></Field><Field label="Orden de aparición"><input type="number" value={banner.display_order} onChange={(event) => setBanner({ display_order: Number(event.target.value) })} /></Field><Field label="Publicar a partir de"><input type="datetime-local" value={dateInput(banner.start_at)} onChange={(event) => setBanner({ start_at: event.target.value })} /></Field><Field label="Dejar de mostrar después de"><input type="datetime-local" value={dateInput(banner.end_at)} onChange={(event) => setBanner({ end_at: event.target.value })} /></Field><Field label="Descripción de la imagen" help="Ayuda a personas que utilizan lectores de pantalla."><input placeholder="Describe brevemente la imagen" value={banner.alt_text || ""} onChange={(event) => setBanner({ alt_text: event.target.value })} /></Field></details>
                <div className="home-admin-mobile-preview"><strong>Vista previa en teléfono</strong><BannerPreview banner={banner} mobile /></div>
              </>}
              {isDraft ? <div className="home-admin-step-actions"><button type="button" disabled={bannerStep === 1} onClick={() => setBannerStep((step) => Math.max(1, step - 1))}>Volver</button>{bannerStep < 4 ? <button type="button" className="pink-btn" onClick={() => setBannerStep((step) => Math.min(4, step + 1))}>Continuar</button> : <><button type="button" disabled={busy === "banner-new"} onClick={() => save("banner", { ...banner, is_active: false })}>Guardar como borrador</button><button type="button" className="pink-btn" disabled={busy === "banner-new"} onClick={() => save("banner", { ...banner, is_active: true })}>Publicar</button></>}</div> : <button className="pink-btn" disabled={busy === `banner-${banner.id}`} onClick={() => save("banner", banner)}>Guardar cambios</button>}
            </article>
          );
        })}
          </div>
        </section>
      )}

      {area === "categories" && (
        <section>
          <AreaHeader title="Categorías destacadas" description="Elige las categorías que aparecerán primero en la tienda." onBack={() => goTo("overview")} />
          <div className="home-admin-list">
        {[...data.featuredCategories, categoryDraft].map((category) => {
          const isDraft = !category.id;
          const setCategory = (changes) => isDraft
            ? setCategoryDraft((current) => ({ ...current, ...changes }))
            : updateCollection("featuredCategories", category.id, changes);
          return (
            <article className="home-admin-card" key={category.id || "new-category"}>
              <div className="home-admin-card-title"><div><strong>{isDraft ? "Agregar una categoría" : category.category_name}</strong><small>{category.is_active ? "Visible en Inicio" : "Guardada como borrador"}</small></div>{!isDraft && <button className="home-admin-danger-link" onClick={() => remove("category", category.id)}>Quitar</button>}</div>
              {category.image_url && <div className="home-admin-category-preview"><img src={category.image_url} alt="" /><strong>{category.category_name || "Nombre de la categoría"}</strong></div>}
              <Field label="Elegir categoría"><select value={category.category_name || ""} onChange={(event) => setCategory({ category_name: event.target.value })}><option value="">Selecciona una categoría</option>{data.productCategories.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
              <ImageField label="Imagen de la categoría" help="Usa una imagen clara que represente esta colección." value={category.image_url} onChange={(image_url) => setCategory({ image_url })} />
              <label className="home-admin-switch"><input type="checkbox" checked={category.is_active} onChange={(event) => setCategory({ is_active: event.target.checked })} /><span />{category.is_active ? "Mostrar en Inicio" : "Guardar como borrador"}</label>
              <details className="home-admin-advanced"><summary>Opciones avanzadas</summary><Field label="Orden de aparición"><input type="number" value={category.display_order} onChange={(event) => setCategory({ display_order: Number(event.target.value) })} /></Field><Field label="Mostrar a partir de"><input type="datetime-local" value={dateInput(category.start_at)} onChange={(event) => setCategory({ start_at: event.target.value })} /></Field><Field label="Ocultar después de"><input type="datetime-local" value={dateInput(category.end_at)} onChange={(event) => setCategory({ end_at: event.target.value })} /></Field><Field label="Descripción de la imagen"><input placeholder="Ejemplo: Bolsas de temporada" value={category.alt_text || ""} onChange={(event) => setCategory({ alt_text: event.target.value })} /></Field></details>
              <button className="pink-btn" disabled={busy === `category-${category.id || "new"}`} onClick={() => save("category", category)}>{isDraft ? category.is_active ? "Publicar categoría" : "Guardar como borrador" : "Guardar cambios"}</button>
            </article>
          );
        })}
          </div>
        </section>
      )}

      {area === "whatsapp" && (
        <section>
          <AreaHeader title="Líneas de WhatsApp" description="Las conversaciones se repartirán automáticamente entre las líneas activas." onBack={() => goTo("overview")} />
          <div className="home-admin-list">
        {lines.length ? lines.map((line) => (
          <article className="home-admin-card" key={line.id}>
            <div className="home-admin-card-title"><div><strong>Línea {line.id}</strong><small>{line.is_active ? "Recibiendo conversaciones" : "Desactivada temporalmente"}</small></div></div>
            <Field label="Número de WhatsApp" help="Incluye lada y código de país. Escribe solo números."><input value={line.phone_number} inputMode="numeric" placeholder="Ejemplo: 524771234567" onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, phone_number: event.target.value } : item))} /></Field>
            <label className="home-admin-switch"><input type="checkbox" checked={line.is_active} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, is_active: event.target.checked } : item))} /><span />{line.is_active ? "Línea activa" : "Desactivada temporalmente"}</label>
            <button className="pink-btn" disabled={busy === `line-${line.id}`} onClick={() => saveLine(line)}>{busy === `line-${line.id}` ? "Guardando…" : "Guardar cambios"}</button>
          </article>
        )) : <div className="bulk-note">Las líneas todavía no están disponibles. Intenta recargar el panel o solicita ayuda técnica.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
