import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { isCommunityVideo, resolveCommunityMediaUrl } from "./communityMedia";
import { openAssignedWhatsApp } from "./whatsapp";

const DEVICE_ID_STORAGE_KEY = "vaStyleCommunityDeviceId";
const COMMUNITY_POST_FIELDS =
  "id, media_url, media_type, text, advisor_line, likes_count, whatsapp_clicks, views_count, active, is_pinned, created_at";
const COMMUNITY_POST_FIELDS_FALLBACK =
  "id, media_url, media_type, text, advisor_line, likes_count, whatsapp_clicks, views_count, active, created_at";

const trackGA4 = (eventName, params = {}) => {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
};

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `va-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    const savedDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (savedDeviceId) return savedDeviceId;

    const newDeviceId = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, newDeviceId);
    return newDeviceId;
  } catch {
    return createDeviceId();
  }
}

function isMissingPinnedColumn(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes("is_pinned") || error?.code === "42703";
}

function isPinnedPost(post) {
  return post?.is_pinned === true || String(post?.is_pinned).toLowerCase() === "true";
}

function sortCommunityPosts(posts) {
  return [...posts].sort((firstPost, secondPost) => {
    if (isPinnedPost(firstPost) && !isPinnedPost(secondPost)) return -1;
    if (!isPinnedPost(firstPost) && isPinnedPost(secondPost)) return 1;

    return new Date(secondPost.created_at || 0).getTime() - new Date(firstPost.created_at || 0).getTime();
  });
}

function formatRelativeDate(value, now) {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "";

  const elapsedSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (elapsedSeconds < 60) return "Hace un momento";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `Hace ${elapsedMinutes} min`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Hace ${elapsedHours} hora${elapsedHours === 1 ? "" : "s"}`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `Hace ${elapsedDays} día${elapsedDays === 1 ? "" : "s"}`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `Hace ${elapsedMonths} mes${elapsedMonths === 1 ? "" : "es"}`;
  }

  const elapsedYears = Math.floor(elapsedDays / 365);
  return `Hace ${elapsedYears} año${elapsedYears === 1 ? "" : "s"}`;
}

async function trackPostView(postId) {
  // TODO: Incrementar views_count de forma atómica (idealmente mediante una función RPC de Supabase).
  // Esta función queda preparada para llamarse cuando se defina qué cuenta como una vista válida.
  void postId;
}

async function trackWhatsappClick(postId) {
  // TODO: Incrementar whatsapp_clicks de forma atómica mediante una función RPC de Supabase.
  // Se llama antes de abrir WhatsApp y queda lista para completar cuando exista esa RPC.
  void postId;
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3C8.8 3 3 8.6 3 15.5c0 2.4.7 4.7 2 6.7L3.8 29l7-1.8c1.6.8 3.4 1.2 5.2 1.2 7.2 0 13-5.6 13-12.5S23.2 3 16 3Zm0 22.9c-1.7 0-3.3-.4-4.7-1.2l-.4-.2-4.1 1.1.8-4-.3-.4c-1.1-1.7-1.7-3.6-1.7-5.6 0-5.6 4.7-10.1 10.4-10.1s10.4 4.5 10.4 10.1S21.7 25.9 16 25.9Zm5.7-7.6c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.8.2-.2.3-.9 1-.1.2-.2.2-.4.3-.7.1-2-.9-3.3-2.1-4.1-4-.1-.3 0-.5.1-.7.1-.1.3-.4.5-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.6-.1-.2-.8-1.8-1.1-2.4-.3-.6-.5-.5-.8-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.7 5 .8.3 1.5.5 2 .7.8.2 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

// TODO: Sustituir el valor temporal por el conteo real de notificaciones no leídas.
export default function CommunityFeed({ onBackToStore, notificationCount = 1 }) {
  const [posts, setPosts] = useState([]);
  const [likedPostIds, setLikedPostIds] = useState(() => new Set());
  const [pendingPostIds, setPendingPostIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [autoplayFailedPostIds, setAutoplayFailedPostIds] = useState(() => new Set());
  const [globalMuted, setGlobalMuted] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState({});
  const [imageDimensions, setImageDimensions] = useState({});
  const videoRefs = useRef(new Map());
  const postRefs = useRef(new Map());
  const globalMutedRef = useRef(true);
  const viewedPostIdsRef = useRef(new Set());
  const playedVideoPostIdsRef = useRef(new Set());
  const completedVideoPostIdsRef = useRef(new Set());
  const communityViewTrackedRef = useRef(false);
  const whatsappAssignmentRef = useRef(new Set());
  const videoPostKeys = posts.filter(isCommunityVideo).map((post) => String(post.id)).join("|");
  const communityPostKeys = posts.map((post) => String(post.id)).join("|");

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError("");

    let { data, error: postsError } = await supabase
      .from("community_posts")
      .select(COMMUNITY_POST_FIELDS)
      .eq("active", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (postsError && isMissingPinnedColumn(postsError)) {
      const fallbackResponse = await supabase
        .from("community_posts")
        .select(COMMUNITY_POST_FIELDS_FALLBACK)
        .eq("active", true)
        .order("created_at", { ascending: false });

      data = (fallbackResponse.data || []).map((post) => ({ ...post, is_pinned: false }));
      postsError = fallbackResponse.error;
    }

    if (postsError) {
      console.error("No fue posible cargar Comunidad V&A Style:", postsError);
      setError("No pudimos cargar la comunidad. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    const nextPosts = sortCommunityPosts(data || []);
    setPosts(nextPosts);

    if (nextPosts.length > 0) {
      const deviceId = getDeviceId();
      const { data: likes, error: likesError } = await supabase
        .from("community_likes")
        .select("post_id")
        .eq("device_id", deviceId)
        .in("post_id", nextPosts.map((post) => post.id));

      if (likesError) {
        console.error("No fue posible consultar los likes del dispositivo:", likesError);
      } else {
        setLikedPostIds(new Set((likes || []).map((like) => String(like.post_id))));
      }
    } else {
      setLikedPostIds(new Set());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => {
      void loadFeed();
    }, 0);

    return () => window.clearTimeout(requestId);
  }, [loadFeed]);

  useEffect(() => {
    if (communityViewTrackedRef.current) return;

    communityViewTrackedRef.current = true;
    trackGA4("community_view", { section: "community" });
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (loading || posts.length === 0 || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const postsById = new Map(posts.map((post) => [String(post.id), post]));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;

          const postId = entry.target.dataset.communityPostId;
          if (!postId || viewedPostIdsRef.current.has(postId)) return;

          const post = postsById.get(postId);
          if (!post) return;

          viewedPostIdsRef.current.add(postId);
          trackGA4("community_post_view", {
            post_id: post.id,
            media_type: post.media_type || (post.video_url ? "video" : "image"),
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: [0.5] }
    );

    postRefs.current.forEach((element, postId) => {
      if (!viewedPostIdsRef.current.has(postId)) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [loading, communityPostKeys, posts]);

  useEffect(() => {
    if (loading) return undefined;

    const videos = [...videoRefs.current.entries()];
    if (!videos.length) return undefined;

    let disposed = false;
    let activePostKey = null;
    const visibilityRatios = new Map(videos.map(([postKey]) => [postKey, 0]));

    function pauseInactiveVideos(nextActivePostKey) {
      videoRefs.current.forEach((video, postKey) => {
        if (postKey !== nextActivePostKey) {
          video.muted = globalMutedRef.current;
          if (!video.paused) video.pause();
        }
      });
    }

    async function playActiveVideo(postKey) {
      const video = videoRefs.current.get(postKey);
      if (!video || document.hidden) return;

      pauseInactiveVideos(postKey);
      video.muted = globalMutedRef.current;

      try {
        await video.play();
        if (disposed) return;
        setAutoplayFailedPostIds((current) => {
          if (!current.has(postKey)) return current;
          const next = new Set(current);
          next.delete(postKey);
          return next;
        });
      } catch {
        if (disposed) return;
        setAutoplayFailedPostIds((current) => new Set(current).add(postKey));
      }
    }

    function selectMainVideo() {
      let nextActivePostKey = null;
      let highestRatio = 0.35;

      visibilityRatios.forEach((ratio, postKey) => {
        if (ratio > highestRatio) {
          highestRatio = ratio;
          nextActivePostKey = postKey;
        }
      });

      if (!nextActivePostKey) {
        activePostKey = null;
        pauseInactiveVideos(null);
        return;
      }

      if (nextActivePostKey !== activePostKey) {
        activePostKey = nextActivePostKey;
        void playActiveVideo(activePostKey);
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        pauseInactiveVideos(null);
      } else {
        selectMainVideo();
        if (activePostKey) void playActiveVideo(activePostKey);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (typeof IntersectionObserver === "undefined") {
      activePostKey = videos[0][0];
      void playActiveVideo(activePostKey);

      return () => {
        disposed = true;
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        pauseInactiveVideos(null);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const postKey = entry.target.dataset.communityPostKey;
          if (postKey) visibilityRatios.set(postKey, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        selectMainVideo();
      },
      {
        root: null,
        rootMargin: "-8% 0px -18%",
        threshold: [0, 0.25, 0.35, 0.5, 0.65, 0.8, 1],
      }
    );

    videos.forEach(([, video]) => observer.observe(video));

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      pauseInactiveVideos(null);
    };
  }, [loading, videoPostKeys]);

  async function syncLikesCount(postId, fallbackCount) {
    const { count, error: countError } = await supabase
      .from("community_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    const exactCount = countError ? fallbackCount : count;

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId ? { ...post, likes_count: Math.max(0, exactCount ?? fallbackCount) } : post
      )
    );

    if (!countError && count !== null) {
      // Mantiene community_posts.likes_count sincronizado. Para alta concurrencia conviene reemplazarlo por RPC/trigger.
      const { error: updateError } = await supabase
        .from("community_posts")
        .update({ likes_count: count })
        .eq("id", postId);

      if (updateError) {
        console.error("El like se guardó, pero no se sincronizó likes_count:", updateError);
      }
    }
  }

  async function toggleLike(post) {
    const postKey = String(post.id);
    if (pendingPostIds.has(postKey)) return;

    const wasLiked = likedPostIds.has(postKey);
    const previousCount = Number(post.likes_count) || 0;
    const optimisticCount = Math.max(0, previousCount + (wasLiked ? -1 : 1));

    setPendingPostIds((current) => new Set(current).add(postKey));
    setLikedPostIds((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(postKey);
      else next.add(postKey);
      return next;
    });
    setPosts((currentPosts) =>
      currentPosts.map((currentPost) =>
        currentPost.id === post.id ? { ...currentPost, likes_count: optimisticCount } : currentPost
      )
    );

    const deviceId = getDeviceId();
    const result = wasLiked
      ? await supabase
          .from("community_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("device_id", deviceId)
      : await supabase.from("community_likes").insert({ post_id: post.id, device_id: deviceId });

    if (result.error) {
      console.error("No fue posible actualizar el like:", result.error);
      setLikedPostIds((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(postKey);
        else next.delete(postKey);
        return next;
      });
      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id === post.id ? { ...currentPost, likes_count: previousCount } : currentPost
        )
      );
      setError("No pudimos guardar tu like. Intenta nuevamente.");
    } else {
      setError("");
      trackGA4(wasLiked ? "community_unlike" : "community_like", {
        post_id: post.id,
      });
      await syncLikesCount(post.id, optimisticCount);
    }

    setPendingPostIds((current) => {
      const next = new Set(current);
      next.delete(postKey);
      return next;
    });
  }

  async function openWhatsapp(post) {
    const postKey = String(post.id);
    if (whatsappAssignmentRef.current.has(postKey)) return;
    whatsappAssignmentRef.current.add(postKey);
    try {
      const assignment = await openAssignedWhatsApp();
      trackGA4("community_whatsapp_click", {
        post_id: post.id,
        advisor_line: assignment.advisorLine || "fallback",
        source: "app",
        screen: "community",
      });
      void trackWhatsappClick(post.id);
    } finally {
      whatsappAssignmentRef.current.delete(postKey);
    }
  }

  function handleMediaLoaded(postId) {
    void trackPostView(postId);
  }

  function handleVideoMetadata(postKey, video) {
    const width = Number(video.videoWidth) || 16;
    const height = Number(video.videoHeight) || 9;
    const aspectRatio = width / height;
    const format = aspectRatio < 0.95 ? "vertical" : aspectRatio > 1.05 ? "horizontal" : "square";
    const nextDimensions = { width, height, aspectRatio, format };

    setVideoDimensions((current) => {
      const savedDimensions = current[postKey];
      if (savedDimensions?.width === width && savedDimensions?.height === height) return current;
      return { ...current, [postKey]: nextDimensions };
    });
  }

  function handleVideoPlay(postId) {
    const postKey = String(postId);
    if (playedVideoPostIdsRef.current.has(postKey)) return;

    playedVideoPostIdsRef.current.add(postKey);
    trackGA4("community_video_play", { post_id: postId });
  }

  function handleVideoComplete(postId) {
    const postKey = String(postId);
    if (completedVideoPostIdsRef.current.has(postKey)) return;

    completedVideoPostIdsRef.current.add(postKey);
    trackGA4("community_video_complete", { post_id: postId });
  }

  function handleVideoProgress(postId, video) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.currentTime / video.duration >= 0.95) handleVideoComplete(postId);
  }

  function handleReturnToStore() {
    trackGA4("community_return_store", { source: "community" });
    onBackToStore?.();
  }

  function handleImageLoad(postKey, postId, image) {
    const width = Number(image.naturalWidth) || 16;
    const height = Number(image.naturalHeight) || 9;
    const aspectRatio = width / height;
    const format = height > width ? "vertical" : aspectRatio > 1.05 ? "horizontal" : "square";
    const nextDimensions = { width, height, aspectRatio, format };

    setImageDimensions((current) => {
      const savedDimensions = current[postKey];
      if (savedDimensions?.width === width && savedDimensions?.height === height) return current;
      return { ...current, [postKey]: nextDimensions };
    });

    handleMediaLoaded(postId);
  }

  async function retryVideoPlayback(postKey) {
    const video = videoRefs.current.get(postKey);
    if (!video) return;

    videoRefs.current.forEach((otherVideo, otherPostKey) => {
      if (otherPostKey !== postKey) otherVideo.pause();
    });
    video.muted = globalMutedRef.current;

    try {
      await video.play();
      setAutoplayFailedPostIds((current) => {
        const next = new Set(current);
        next.delete(postKey);
        return next;
      });
    } catch {
      setAutoplayFailedPostIds((current) => new Set(current).add(postKey));
    }
  }

  async function toggleVideoSound(postKey) {
    const video = videoRefs.current.get(postKey);
    if (!video) return;

    const nextGlobalMuted = !globalMutedRef.current;
    globalMutedRef.current = nextGlobalMuted;
    setGlobalMuted(nextGlobalMuted);

    videoRefs.current.forEach((otherVideo, otherPostKey) => {
      otherVideo.muted = nextGlobalMuted;
      if (otherPostKey !== postKey) {
        otherVideo.pause();
      }
    });

    try {
      await video.play();
      setAutoplayFailedPostIds((current) => {
        if (!current.has(postKey)) return current;
        const next = new Set(current);
        next.delete(postKey);
        return next;
      });
    } catch {
      setAutoplayFailedPostIds((current) => new Set(current).add(postKey));
    }
  }

  const activePosts = posts.filter((post) => post.active !== false);
  const sortedPosts = sortCommunityPosts(activePosts);
  const visiblePosts = sortedPosts;

  return (
    <section className="community-feed" aria-labelledby="community-feed-title">
      <style>{`
        .community-feed, .community-feed * { box-sizing: border-box; }
        .community-feed {
          width: 100%;
          max-width: 430px;
          min-height: 100vh;
          margin: 0 auto;
          padding: 0 10px 78px;
          background: #fffaf7;
          color: #2f2927;
          font-family: Arial, sans-serif;
          text-align: left;
        }
        .community-feed__header {
          position: sticky;
          top: 0;
          z-index: 30;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 42px;
          align-items: center;
          width: calc(100% + 20px);
          min-height: 62px;
          margin: 0 -10px;
          padding: 7px max(12px, env(safe-area-inset-right)) 7px max(12px, env(safe-area-inset-left));
          background: rgba(255, 250, 247, .96);
          border-bottom: 1px solid #f1ded6;
          box-shadow: 0 7px 22px rgba(90, 50, 30, .07);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .community-feed__logo {
          display: block;
          width: 38px;
          height: 38px;
          border: 1px solid #efdcd5;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 3px 10px rgba(90, 50, 30, .1);
        }
        .community-feed__header h1 {
          overflow: hidden;
          margin: 0 8px;
          color: #8d1730;
          font-family: Georgia, serif;
          font-size: clamp(17px, 5vw, 23px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: 0;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .community-feed__notifications {
          position: relative;
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          padding: 0;
          border: 1px solid #efdcd5;
          border-radius: 50%;
          background: #fff;
          color: #8d1730;
          cursor: default;
        }
        .community-feed__notifications svg { width: 21px; height: 21px; }
        .community-feed__notification-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          display: grid;
          place-items: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border: 2px solid #fffaf7;
          border-radius: 999px;
          background: #c94462;
          color: #fff;
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
        }
        .community-feed__intro {
          width: 100%;
          margin: 0 auto;
          padding: 13px 8px 11px;
          text-align: center;
        }
        .community-feed__eyebrow {
          display: block;
          margin-bottom: 5px;
          color: #c94462;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 1.6px;
          text-transform: uppercase;
        }
        .community-feed__intro p {
          margin: 0;
          color: #6b403e;
          font-size: 13px;
          line-height: 1.45;
        }
        .community-feed__list {
          display: flex;
          flex-direction: column;
          width: 100%;
          margin: 0 auto;
          gap: 14px;
        }
        .community-post {
          overflow: hidden;
          background: #fff;
          border: 1px solid #f1ded6;
          border-radius: 16px;
          box-shadow: 0 9px 26px rgba(90, 50, 30, .1);
        }
        .community-post.is-pinned {
          order: -1;
        }
        .community-post__media-wrap {
          position: relative;
          width: 100%;
          background: #f7ebe6;
        }
        .community-post__media-wrap.is-video { background: #F1EEE8; }
        .community-post__media {
          display: block;
          width: 100%;
        }
        .community-post__image {
          aspect-ratio: 16 / 9;
          background: #f7ebe6;
          object-fit: cover;
          object-position: center;
        }
        .community-post__image.is-vertical {
          background: #F1EEE8;
          object-fit: contain;
          object-position: center;
        }
        .community-post__video {
          height: auto;
          max-height: 60vh;
          max-height: 60svh;
          aspect-ratio: 16 / 9;
          margin: 0 auto;
          background: #F1EEE8;
          object-fit: contain;
          object-position: center;
        }
        .community-post__play-fallback {
          position: absolute;
          inset: 50% auto auto 50%;
          display: grid;
          place-items: center;
          width: 54px;
          height: 54px;
          padding: 0 0 0 4px;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255,255,255,.8);
          border-radius: 50%;
          background: rgba(47,41,39,.7);
          color: #fff;
          font-size: 23px;
          line-height: 1;
          box-shadow: 0 7px 20px rgba(0,0,0,.22);
          backdrop-filter: blur(5px);
          cursor: pointer;
        }
        .community-post__sound-toggle {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: 1px solid rgba(255,255,255,.55);
          border-radius: 50%;
          background: rgba(47,41,39,.58);
          color: #fff;
          font-size: 15px;
          line-height: 1;
          box-shadow: 0 4px 12px rgba(0,0,0,.14);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          cursor: pointer;
        }
        .community-post__sound-toggle:focus-visible {
          outline: 3px solid rgba(255,255,255,.72);
          outline-offset: 2px;
        }
        .community-post__body { padding: 12px 14px 14px; }
        .community-post__pinned-label {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          margin-bottom: 9px;
          padding: 5px 9px;
          border-radius: 999px;
          background: #fff1f4;
          color: #8d1730;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .01em;
        }
        .community-post__actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .community-post__like {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 44px;
          padding: 4px 2px;
          border: 0;
          background: transparent;
          color: #5f3b33;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }
        .community-post__like svg {
          width: 30px;
          height: 30px;
          color: #8d1730;
          filter: drop-shadow(0 2px 3px rgba(141, 23, 48, .12));
        }
        .community-post__like.is-liked svg { color: #c94462; }
        .community-post__like:disabled { cursor: wait; opacity: .65; }
        .community-post__like:focus-visible,
        .community-post__whatsapp:focus-visible,
        .community-feed__retry:focus-visible {
          outline: 3px solid rgba(201, 68, 98, .28);
          outline-offset: 3px;
        }
        .community-post__date { color: #9b7568; font-size: 12px; font-weight: 700; }
        .community-post__text {
          margin: 12px 0 15px;
          color: #4e332d;
          font-size: 15px;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .community-post__whatsapp {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          width: 100%;
          min-height: 46px;
          padding: 11px 16px;
          border: 0;
          border-radius: 11px;
          background: #25d366;
          color: #fff;
          font-size: 14px;
          font-weight: 900;
          box-shadow: 0 7px 16px rgba(37, 211, 102, .2);
          cursor: pointer;
        }
        .community-post__whatsapp svg { width: 23px; height: 23px; fill: currentColor; }
        .community-feed__status {
          width: 100%;
          margin: 34px auto;
          padding: 26px 18px;
          border: 1px solid #f1ded6;
          border-radius: 16px;
          background: #fff;
          color: #6b403e;
          text-align: center;
          box-shadow: 0 8px 22px rgba(90, 50, 30, .07);
        }
        .community-feed__status p { margin: 0; }
        .community-feed__error-banner {
          width: 100%;
          margin: 0 auto 14px;
          padding: 10px 13px;
          border: 1px solid #f0cbd3;
          border-radius: 10px;
          background: #fff1f4;
          color: #8d1730;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
        }
        .community-feed__retry {
          margin-top: 15px;
          padding: 10px 16px;
          border: 0;
          border-radius: 9px;
          background: #c94462;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .community-feed__footer {
          position: fixed;
          left: 50%;
          bottom: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: min(100%, 430px);
          min-height: 50px;
          margin: 0;
          padding: 7px 14px calc(7px + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          background: rgba(255, 250, 247, .96);
          border-top: 1px solid #f1ded6;
          box-shadow: 0 -5px 18px rgba(90, 50, 30, .06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .community-feed__store-button {
          width: auto;
          min-height: 34px;
          padding: 6px 4px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #7a4050;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }
        .community-feed__notifications:focus-visible,
        .community-feed__store-button:focus-visible {
          outline: 3px solid rgba(201, 68, 98, .28);
          outline-offset: 3px;
        }
        @media (min-width: 431px) {
          .community-feed {
            border-right: 1px solid #f1ded6;
            border-left: 1px solid #f1ded6;
            box-shadow: 0 0 32px rgba(90, 50, 30, .08);
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .community-post__like svg { transition: color .18s ease, transform .18s ease; }
          .community-post__like.is-liked svg { transform: scale(1.08); }
          .community-post__whatsapp { transition: transform .18s ease, box-shadow .18s ease; }
          .community-post__whatsapp:hover { transform: translateY(-1px); box-shadow: 0 9px 20px rgba(37, 211, 102, .27); }
        }
        /* Premium V & A visual layer. Feed behavior and analytics remain unchanged. */
        .community-feed {
          max-width: 1180px;
          padding: 0 clamp(16px, 4vw, 52px) 110px;
          background: #faf8f5;
          color: #171717;
        }
        .community-feed__header {
          grid-template-columns: 44px minmax(0, 1fr) 44px;
          width: calc(100% + clamp(32px, 8vw, 104px));
          min-height: 68px;
          margin: 0 calc(clamp(16px, 4vw, 52px) * -1);
          padding-inline: clamp(16px, 4vw, 52px);
          background: rgba(250,248,245,.96);
          border-color: #e9e4df;
          box-shadow: none;
        }
        .community-feed__back {
          width: 44px;
          height: 44px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #171717;
          font-size: 20px;
        }
        .community-feed__header h1 {
          color: #171717;
          font: 400 17px/1 Georgia, serif;
          letter-spacing: .13em;
        }
        .community-feed__notifications {
          width: 44px;
          height: 44px;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: #171717;
        }
        .community-feed__notification-badge {
          top: 2px;
          right: 0;
          border-color: #faf8f5;
          background: #171717;
        }
        .community-feed__intro { padding: clamp(55px,8vw,90px) 10px 42px }
        .community-feed__eyebrow { color: #b59a6a; font: 600 10px Arial; letter-spacing: .28em }
        .community-feed__intro:before {
          content: "Comunidad";
          display: block;
          margin: 12px 0 15px;
          color: #171717;
          font: 400 clamp(42px,7vw,68px)/1 Georgia,serif;
          letter-spacing: -.025em;
        }
        .community-feed__intro p { color: #6e6a66; font: 14px/1.6 Arial }
        .community-feed__list {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 760px;
          margin-inline: auto;
          gap: 46px;
        }
        .community-post {
          width: 100%;
          align-self: start;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .community-post__media-wrap,.community-post__media-wrap.is-video { background:#eee9e4 }
        .community-post__body { padding: 18px 2px 0 }
        .community-post__pinned-label {
          padding: 0;
          border-radius: 0;
          background: transparent;
          color: #b59a6a;
          font: 600 9px Arial;
          letter-spacing: .15em;
        }
        .community-post__like { color:#171717; font-weight:500 }
        .community-post__like svg { width:25px; height:25px; color:#171717; filter:none }
        .community-post__like.is-liked svg { color:#b59a6a }
        .community-post__date { color:#898581; font:11px Arial }
        .community-post__text { color:#2a2928; font:400 15px/1.65 Arial }
        .community-post__whatsapp {
          justify-content:flex-start;
          width:auto;
          min-height:44px;
          padding:10px 0 7px;
          border-bottom:1px solid #171717;
          border-radius:0;
          background:transparent;
          color:#171717;
          box-shadow:none;
          font:600 10px Arial;
          letter-spacing:.12em;
        }
        .community-post__whatsapp svg { width:18px; height:18px }
        .community-feed__status,.community-feed__error-banner {
          border-color:#e9e4df;
          border-radius:0;
          background:#fff;
          color:#6e6a66;
          box-shadow:none;
        }
        .community-feed__retry { border-radius:0; background:#171717; font:600 10px Arial; letter-spacing:.12em }
        .community-feed__footer {
          width:100%;
          min-height:64px;
          padding:8px max(18px,env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom));
          background:rgba(250,248,245,.96);
          border-color:#e9e4df;
          box-shadow:none;
        }
        .community-feed__store-button { min-height:44px; color:#171717; font:600 10px Arial; letter-spacing:.12em }
        @media(max-width:700px){
          .community-feed__list{max-width:100%;gap:38px}
          .community-feed__intro{padding-top:45px}
        }
      `}</style>

      <header className="community-feed__header">
        <button className="community-feed__back" type="button" onClick={handleReturnToStore} aria-label="Volver al inicio">←</button>
        <h1 id="community-feed-title">V &amp; A STYLE</h1>
        <button className="community-feed__notifications" type="button" aria-label="Notificaciones">
          <BellIcon />
          {notificationCount > 0 && (
            <span className="community-feed__notification-badge" aria-label={`${notificationCount} notificaciones`}>
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>
      </header>

      <div className="community-feed__intro">
        <span className="community-feed__eyebrow">Inspírate y descubre</span>
        <p>Novedades, ideas y piezas seleccionadas para hacer crecer tu estilo.</p>
      </div>

      {error && !loading && visiblePosts.length > 0 && (
        <div className="community-feed__error-banner" role="status">{error}</div>
      )}

      {loading ? (
        <div className="community-feed__status" role="status">
          <p>Cargando publicaciones…</p>
        </div>
      ) : error && visiblePosts.length === 0 ? (
        <div className="community-feed__status" role="alert">
          <p>{error}</p>
          <button className="community-feed__retry" type="button" onClick={loadFeed}>
            Reintentar
          </button>
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="community-feed__status">
          <p>Pronto encontrarás nuevas publicaciones aquí.</p>
        </div>
      ) : (
        <div className="community-feed__list">
          {visiblePosts.map((post) => {
            const postKey = String(post.id);
            const isLiked = likedPostIds.has(postKey);
            const isPending = pendingPostIds.has(postKey);
            const mediaUrl = resolveCommunityMediaUrl(supabase, post.media_url);

            return (
              <article
                ref={(element) => {
                  if (element) postRefs.current.set(postKey, element);
                  else postRefs.current.delete(postKey);
                }}
                className={`community-post${isPinnedPost(post) ? " is-pinned" : ""}`}
                data-community-post-id={postKey}
                key={post.id}
              >
                <div className={`community-post__media-wrap${isCommunityVideo(post) ? " is-video" : ""}`}>
                  {isCommunityVideo(post) ? (
                    <>
                      <video
                        ref={(video) => {
                          if (video) videoRefs.current.set(postKey, video);
                          else videoRefs.current.delete(postKey);
                        }}
                        className={`community-post__media community-post__video${
                          videoDimensions[postKey] ? ` is-${videoDimensions[postKey].format}` : ""
                        }`}
                        style={videoDimensions[postKey]
                          ? { aspectRatio: `${videoDimensions[postKey].width} / ${videoDimensions[postKey].height}` }
                          : undefined}
                        data-community-post-key={postKey}
                        src={mediaUrl}
                        muted={globalMuted}
                        playsInline
                        loop
                        preload="metadata"
                        onLoadedMetadata={(event) => handleVideoMetadata(postKey, event.currentTarget)}
                        onLoadedData={() => handleMediaLoaded(post.id)}
                        onPlay={() => handleVideoPlay(post.id)}
                        onEnded={() => handleVideoComplete(post.id)}
                        onTimeUpdate={(event) => handleVideoProgress(post.id, event.currentTarget)}
                      />
                      {autoplayFailedPostIds.has(postKey) && (
                        <button
                          className="community-post__play-fallback"
                          type="button"
                          onClick={() => retryVideoPlayback(postKey)}
                          aria-label="Reproducir video"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        className="community-post__sound-toggle"
                        type="button"
                        onClick={() => toggleVideoSound(postKey)}
                        aria-label={globalMuted ? "Activar sonido en los videos" : "Silenciar todos los videos"}
                        aria-pressed={!globalMuted}
                      >
                        {globalMuted ? "🔇" : "🔊"}
                      </button>
                    </>
                  ) : (
                    <img
                      className={`community-post__media community-post__image${
                        imageDimensions[postKey]?.format === "vertical" ? " is-vertical" : ""
                      }`}
                      style={imageDimensions[postKey]?.format === "vertical"
                        ? { aspectRatio: `${imageDimensions[postKey].width} / ${imageDimensions[postKey].height}` }
                        : undefined}
                      src={mediaUrl}
                      alt={post.text ? post.text.slice(0, 120) : "Publicación de Comunidad V&A Style"}
                      loading="lazy"
                      decoding="async"
                      onLoad={(event) => handleImageLoad(postKey, post.id, event.currentTarget)}
                    />
                  )}
                </div>

                <div className="community-post__body">
                  {post.is_pinned && (
                    <div className="community-post__pinned-label" aria-label="Publicación fijada">
                      📌 Publicación fijada
                    </div>
                  )}

                  <div className="community-post__actions">
                    <button
                      className={`community-post__like${isLiked ? " is-liked" : ""}`}
                      type="button"
                      onClick={() => toggleLike(post)}
                      disabled={isPending}
                      aria-label={isLiked ? "Quitar me gusta" : "Me gusta"}
                      aria-pressed={isLiked}
                    >
                      <HeartIcon filled={isLiked} />
                      <span>{Math.max(0, Number(post.likes_count) || 0)}</span>
                    </button>
                    <time className="community-post__date" dateTime={post.created_at || undefined}>
                      {formatRelativeDate(post.created_at, now)}
                    </time>
                  </div>

                  {post.text && <p className="community-post__text">{post.text}</p>}

                  <button
                    className="community-post__whatsapp"
                    type="button"
                    onClick={() => openWhatsapp(post)}
                  >
                    <WhatsAppIcon />
                    Hablar con un asesor
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="community-feed__footer">
        <button className="community-feed__store-button" type="button" onClick={handleReturnToStore}>
          ← Volver a tienda
        </button>
      </footer>
    </section>
  );
}
