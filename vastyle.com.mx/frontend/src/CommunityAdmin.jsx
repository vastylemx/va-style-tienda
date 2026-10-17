import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "./adminApi";
import { resolveCommunityMediaUrl } from "./communityMedia";
import {
  COMMUNITY_IMAGE_INPUT_MAX_BYTES,
  COMMUNITY_VIDEO_INPUT_MAX_BYTES,
  COMMUNITY_VIDEO_OUTPUT_MAX_BYTES,
  formatCommunityFileSize,
} from "./communityMediaLimits";

const MAX_POST_TEXT_LENGTH = 200;

function isSupportedMedia(file) {
  return Boolean(file?.type?.startsWith("image/") || file?.type?.startsWith("video/"));
}

function getMediaType(file) {
  return file?.type?.startsWith("video/") ? "video" : "image";
}

function getAdvisorLineLabel(value) {
  const line = Number(value);
  return line > 0 ? `Línea ${line}` : "Sin asesor asignado";
}

function isVideoPost(post) {
  return String(post.media_type || "").toLowerCase().startsWith("video");
}

function sortAdminPosts(posts) {
  return [...posts].sort((firstPost, secondPost) => {
    const pinnedDifference = Number(Boolean(secondPost.is_pinned)) - Number(Boolean(firstPost.is_pinned));
    if (pinnedDifference !== 0) return pinnedDifference;

    return new Date(secondPost.created_at || 0).getTime() - new Date(firstPost.created_at || 0).getTime();
  });
}

export default function CommunityAdmin({ onClose }) {
  const [posts, setPosts] = useState([]);
  const [advisorLines, setAdvisorLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [busyPostId, setBusyPostId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [advisorLine, setAdvisorLine] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imagePreviewDimensions, setImagePreviewDimensions] = useState({});
  const fileInputRef = useRef(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminFetch("/community-admin.php");
      const lines = Array.isArray(result.advisorLines) ? result.advisorLines : [];
      setAdvisorLines(lines);
      setAdvisorLine((current) => lines.some((line) => String(line) === current)
        ? current : String(lines[0] || ""));
      setPosts(sortAdminPosts(result.posts || []));
    } catch (loadError) {
      console.error("No fue posible cargar las publicaciones de Comunidad:", loadError);
      setError("No se pudieron cargar las publicaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => {
      void loadPosts();
    }, 0);

    return () => window.clearTimeout(requestId);
  }, [loadPosts]);

  function resetForm() {
    setFile(null);
    setText("");
    setAdvisorLine(String(advisorLines[0] || ""));
    setPublishStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setError("");

    if (nextFile && !isSupportedMedia(nextFile)) {
      setFile(null);
      event.target.value = "";
      setError("Selecciona únicamente una imagen o un video.");
      return;
    }

    if (nextFile?.type?.startsWith("image/") && nextFile.size > COMMUNITY_IMAGE_INPUT_MAX_BYTES) {
      setFile(null);
      event.target.value = "";
      setError(
        `La imagen pesa ${formatCommunityFileSize(nextFile.size)}. El máximo permitido es 10 MB.`
      );
      return;
    }

    if (nextFile?.type?.startsWith("video/") && nextFile.size > COMMUNITY_VIDEO_INPUT_MAX_BYTES) {
      setFile(null);
      event.target.value = "";
      setError(
        `El video pesa ${formatCommunityFileSize(nextFile.size)}. El máximo antes de comprimir es 60 MB.`
      );
      return;
    }

    setFile(nextFile);
  }

  function handlePreviewImageLoad(postId, image) {
    const width = Number(image.naturalWidth) || 1;
    const height = Number(image.naturalHeight) || 1;
    const format = height > width ? "vertical" : width > height ? "horizontal" : "square";

    setImagePreviewDimensions((current) => {
      const savedDimensions = current[postId];
      if (savedDimensions?.width === width && savedDimensions?.height === height) return current;
      return { ...current, [postId]: { width, height, format } };
    });
  }

  async function publishPost(event) {
    event.preventDefault();

    const cleanText = text.trim();
    if (!file || !isSupportedMedia(file)) {
      setError("Selecciona una imagen o un video para publicar.");
      return;
    }

    if (!cleanText) {
      setError("Escribe el texto de la publicación.");
      return;
    }

    if (cleanText.length > MAX_POST_TEXT_LENGTH) {
      setError(`El texto no puede superar ${MAX_POST_TEXT_LENGTH} caracteres.`);
      return;
    }

    if (!advisorLines.some((line) => String(line) === advisorLine)) {
      setError("Selecciona una línea de atención activa.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const mediaType = getMediaType(file);
    try {
      let uploadFile = file;

      if (mediaType === "video") {
        setPublishStatus("Comprimiendo video…");
        const { compressCommunityVideo } = await import("./communityVideoCompression");
        uploadFile = await compressCommunityVideo(file, {
          onProgress: (progress) => {
            setPublishStatus(`Comprimiendo video… ${progress}%`);
          },
        });

        if (uploadFile.size > COMMUNITY_VIDEO_OUTPUT_MAX_BYTES) {
          throw new Error(
            "No fue posible comprimir el video por debajo de 15 MB. Recórtalo e intenta nuevamente."
          );
        }
      }

      setPublishStatus("Subiendo publicación…");
      const form = new FormData();
      form.append("file", uploadFile, uploadFile.name);
      const uploaded = await adminFetch("/community-admin.php", { method: "POST", body: form });
      if (!uploaded?.url || uploaded.mediaType !== mediaType) {
        throw new Error("No se pudo confirmar la subida del archivo.");
      }

      const creationResult = await adminFetch("/community-admin.php", {
        method: "POST",
        body: JSON.stringify({
          media_url: uploaded.url,
          media_type: mediaType,
          text: cleanText,
          advisor_line: Number(advisorLine),
        }),
      });

      const createdPost = creationResult?.post;

      if (!creationResult?.ok || !createdPost) {
        throw new Error("La base de datos no confirmó la publicación.");
      }

      setPosts((currentPosts) => sortAdminPosts([{ ...createdPost, is_pinned: Boolean(createdPost.is_pinned) }, ...currentPosts]));
      resetForm();
      setShowForm(false);
      setMessage("Publicación creada correctamente.");
    } catch (publishError) {
      console.error("No fue posible publicar en Comunidad:", publishError);
      setError(publishError.message || "No se pudo crear la publicación.");
    } finally {
      setSaving(false);
      setPublishStatus("");
    }
  }

  async function togglePostVisibility(post) {
    const nextActive = !post.active;
    setBusyPostId(post.id);
    setError("");
    setMessage("");

    try {
      const result = await adminFetch("/community-admin.php", {
        method: "PATCH",
        body: JSON.stringify({ id: post.id, field: "active", value: nextActive }),
      });
      if (!result?.post || Boolean(result.post.active) !== nextActive) {
        throw new Error("La base de datos no confirmó el cambio de visibilidad.");
      }
      setPosts((currentPosts) => sortAdminPosts(currentPosts.map((currentPost) =>
        currentPost.id === post.id ? result.post : currentPost
      )));
      setMessage(nextActive ? "Publicación visible en el feed." : "Publicación ocultada.");
    } catch (updateError) {
      console.error("No fue posible cambiar la visibilidad:", updateError);
      setError("No se pudo cambiar la visibilidad de la publicación.");
    } finally {
      setBusyPostId(null);
    }
  }

  async function togglePinnedPost(post) {
    if (!post?.id) {
      console.error("Post sin id para fijar:", post);
      return;
    }

    const nextPinned = !post.is_pinned;

    setBusyPostId(post.id);
    setError("");
    setMessage("");

    try {
      const result = await adminFetch("/community-admin.php", {
        method: "PATCH",
        body: JSON.stringify({ id: post.id, field: "is_pinned", value: nextPinned }),
      });

      if (!result?.ok || !result?.post || Boolean(result.post.is_pinned) !== nextPinned) {
        throw new Error("La base de datos no confirmó el cambio de publicación fijada.");
      }

      setPosts((currentPosts) => sortAdminPosts(currentPosts.map((currentPost) =>
        currentPost.id === post.id ? result.post : currentPost
      )));
      setMessage(nextPinned ? "Publicación fijada arriba del feed." : "Publicación desfijada.");
    } catch (pinError) {
      console.error("No fue posible cambiar la publicación fijada:", pinError);
      setError(pinError?.message || "No se pudo cambiar la publicación fijada.");
    } finally {
      setBusyPostId(null);
    }
  }

  async function deletePost(post) {
    if (!window.confirm("¿Eliminar esta publicación de Comunidad?")) return;

    setBusyPostId(post.id);
    setError("");
    setMessage("");

    try {
      const deleteResult = await adminFetch("/community-admin.php", {
        method: "DELETE",
        body: JSON.stringify({ id: post.id }),
      });

      if (deleteResult?.confirmedDeleted !== true || String(deleteResult.deletedPostId) !== String(post.id)) {
        throw new Error("No se pudo confirmar el borrado real de la publicación.");
      }

      setPosts((currentPosts) => currentPosts.filter((currentPost) => currentPost.id !== post.id));
      setMessage(deleteResult.storageWarning || "Publicación eliminada.");
    } catch (deleteError) {
      console.error("[CommunityAdmin] Error DELETE community_posts:", deleteError);
      setError(deleteError?.message || "No se pudo eliminar la publicación.");
    } finally {
      setBusyPostId(null);
    }
  }

  return (
    <div className="community-admin-overlay" onClick={saving ? undefined : onClose}>
      <style>{`
        .community-admin-overlay, .community-admin-overlay * { box-sizing: border-box; }
        .community-admin-overlay {
          position: fixed;
          inset: 0;
          z-index: 2600;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
          background: rgba(47, 41, 39, .58);
          font-family: Arial, sans-serif;
        }
        .community-admin {
          width: min(720px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          padding: 18px;
          border: 1px solid #eadbd3;
          border-radius: 18px;
          background: #fff;
          color: #2f2927;
          box-shadow: 0 20px 48px rgba(0, 0, 0, .25);
          text-align: left;
        }
        .community-admin__header,
        .community-admin__toolbar,
        .community-admin__post-top,
        .community-admin__post-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .community-admin__header { margin-bottom: 14px; }
        .community-admin__header h2 {
          margin: 0;
          color: #7a4050;
          font-family: Georgia, serif;
          font-size: 24px;
        }
        .community-admin button { border: 0; cursor: pointer; font-weight: 800; }
        .community-admin button:disabled { cursor: wait; opacity: .6; }
        .community-admin__close {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #fff4ea;
          color: #7a4050;
          font-size: 21px;
        }
        .community-admin__toolbar { margin-bottom: 14px; }
        .community-admin__new,
        .community-admin__publish {
          padding: 11px 16px;
          border-radius: 10px;
          background: #c94462;
          color: #fff;
        }
        .community-admin__form {
          display: grid;
          gap: 11px;
          margin-bottom: 16px;
          padding: 14px;
          border: 1px solid #eadbd3;
          border-radius: 14px;
          background: #fffaf7;
        }
        .community-admin__form label {
          display: grid;
          gap: 6px;
          color: #6b403e;
          font-size: 13px;
          font-weight: 800;
        }
        .community-admin__form input,
        .community-admin__form textarea,
        .community-admin__form select {
          width: 100%;
          padding: 11px 12px;
          border: 1px solid #dfcfc8;
          border-radius: 9px;
          background: #fff;
          color: #2f2927;
          font: inherit;
        }
        .community-admin__form textarea { min-height: 86px; resize: vertical; }
        .community-admin__counter { color: #9b7568; font-size: 11px; text-align: right; }
        .community-admin__message {
          margin-bottom: 12px;
          padding: 9px 11px;
          border-radius: 9px;
          background: #eaf8ef;
          color: #285f38;
          font-size: 13px;
          font-weight: 800;
        }
        .community-admin__message.is-error { background: #fff1f4; color: #8d1730; }
        .community-admin__status { padding: 22px 8px; color: #7a5c50; text-align: center; }
        .community-admin__list { display: grid; gap: 12px; }
        .community-admin__post {
          display: grid;
          grid-template-columns: 112px minmax(0, 1fr);
          gap: 12px;
          padding: 11px;
          border: 1px solid #eadbd3;
          border-radius: 13px;
          background: #fffaf7;
        }
        .community-admin__media {
          display: block;
          width: 112px;
          height: 112px;
          border-radius: 10px;
          background: #f7ebe6;
          object-fit: cover;
          object-position: center;
        }
        .community-admin__media.is-vertical {
          background: #F1EEE8;
          object-fit: contain;
        }
        .community-admin__post-top { align-items: flex-start; }
        .community-admin__post-top strong { color: #7a4050; font-size: 12px; }
        .community-admin__badge {
          flex: 0 0 auto;
          padding: 4px 7px;
          border-radius: 999px;
          background: #eaf8ef;
          color: #285f38;
          font-size: 10px;
          font-weight: 900;
        }
        .community-admin__badge.is-inactive { background: #eee9e6; color: #73645f; }
        .community-admin__badge.is-pinned { background: #fff1f4; color: #8d1730; }
        .community-admin__text {
          margin: 7px 0;
          color: #4e332d;
          font-size: 13px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }
        .community-admin__metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          margin-bottom: 9px;
          color: #7a5c50;
          font-size: 11px;
          font-weight: 800;
        }
        .community-admin__post-actions { justify-content: flex-start; }
        .community-admin__post-actions button {
          padding: 7px 9px;
          border-radius: 8px;
          background: #f4e1cd;
          color: #7a4050;
          font-size: 11px;
        }
        .community-admin__post-actions .is-delete { background: #fff1f4; color: #a72f4d; }
        .community-admin__post-actions .is-pinned-action { background: #fff1f4; color: #8d1730; }
        @media (max-width: 520px) {
          .community-admin-overlay { align-items: stretch; padding: 0; }
          .community-admin { max-height: 100vh; padding: 14px; border-radius: 0; }
          .community-admin__post { grid-template-columns: 86px minmax(0, 1fr); gap: 10px; }
          .community-admin__media { width: 86px; height: 104px; }
          .community-admin__post-actions { flex-wrap: wrap; }
        }
      `}</style>

      <section className="community-admin" onClick={(event) => event.stopPropagation()}>
        <header className="community-admin__header">
          <h2>Comunidad</h2>
          <button className="community-admin__close" type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="community-admin__toolbar">
          <button
            className="community-admin__new"
            type="button"
            onClick={() => {
              setShowForm((current) => !current);
              setError("");
              setMessage("");
            }}
          >
            Nueva publicación
          </button>
        </div>

        {showForm && (
          <form className="community-admin__form" onSubmit={publishPost}>
            <label>
              Imagen o video
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                disabled={saving}
              />
            </label>

            <label>
              Texto
              <textarea
                value={text}
                maxLength={MAX_POST_TEXT_LENGTH}
                onChange={(event) => setText(event.target.value)}
                placeholder="Escribe el texto de la publicación"
                disabled={saving}
              />
              <span className="community-admin__counter">{text.length}/{MAX_POST_TEXT_LENGTH}</span>
            </label>

            <label>
              Línea de atención
              <select value={advisorLine} onChange={(event) => setAdvisorLine(event.target.value)} disabled={saving || advisorLines.length === 0}>
                {advisorLines.map((line) => <option key={line} value={String(line)}>Línea {line}</option>)}
              </select>
            </label>

            <button className="community-admin__publish" type="submit" disabled={saving || advisorLines.length === 0}>
              {saving ? publishStatus || "Subiendo publicación…" : "Publicar"}
            </button>
            {saving && publishStatus && (
              <div className="community-admin__message" role="status" aria-live="polite">
                {publishStatus}
              </div>
            )}
          </form>
        )}

        {message && <div className="community-admin__message" role="status">{message}</div>}
        {error && <div className="community-admin__message is-error" role="alert">{error}</div>}

        {loading ? (
          <div className="community-admin__status">Cargando publicaciones…</div>
        ) : posts.length === 0 ? (
          <div className="community-admin__status">Todavía no hay publicaciones.</div>
        ) : (
          <div className="community-admin__list">
            {posts.map((post) => (
              <article className="community-admin__post" key={post.id}>
                {isVideoPost(post) ? (
                  <video className="community-admin__media" src={resolveCommunityMediaUrl(post.media_url)} controls muted preload="metadata" />
                ) : (
                  <img
                    className={`community-admin__media${
                      imagePreviewDimensions[post.id]?.format === "vertical" ? " is-vertical" : ""
                    }`}
                    src={resolveCommunityMediaUrl(post.media_url)}
                    alt="Vista previa de publicación"
                    loading="lazy"
                    onLoad={(event) => handlePreviewImageLoad(post.id, event.currentTarget)}
                  />
                )}

                <div>
                  <div className="community-admin__post-top">
                    <strong>{getAdvisorLineLabel(post.advisor_line)}</strong>
                    <span className={`community-admin__badge${post.active ? "" : " is-inactive"}`}>
                      {post.active ? "Activa" : "Inactiva"}
                    </span>
                    {post.is_pinned && (
                      <span className="community-admin__badge is-pinned">📌 Fijada</span>
                    )}
                  </div>
                  <p className="community-admin__text">{post.text || "Sin texto"}</p>
                  <div className="community-admin__metrics">
                    <span>♥ {Number(post.likes_count) || 0}</span>
                    <span>WhatsApp: {Number(post.whatsapp_clicks) || 0}</span>
                  </div>
                  <div className="community-admin__post-actions">
                    <button
                      type="button"
                      onClick={() => togglePostVisibility(post)}
                      disabled={busyPostId === post.id}
                    >
                      {post.active ? "Ocultar" : "Mostrar"}
                    </button>
                    <button
                      className={post.is_pinned ? "is-pinned-action" : ""}
                      type="button"
                      onClick={() => togglePinnedPost(post)}
                      disabled={busyPostId === post.id}
                    >
                      {post.is_pinned ? "Desfijar" : "Fijar publicación"}
                    </button>
                    <button
                      className="is-delete"
                      type="button"
                      onClick={() => deletePost(post)}
                      disabled={busyPostId === post.id}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
