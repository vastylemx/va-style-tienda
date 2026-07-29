const COMMUNITY_MEDIA_BUCKET = "community-media";

export function resolveCommunityMediaUrl(client, mediaValue) {
  const value = String(mediaValue || "").trim();
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;

  const storagePath = value
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${COMMUNITY_MEDIA_BUCKET}/`, "i"), "");

  return client.storage.from(COMMUNITY_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function isCommunityVideo(post) {
  const mediaType = String(post?.media_type || "").toLowerCase();
  if (mediaType === "video" || mediaType.startsWith("video/")) return true;
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(post?.media_url || ""));
}

export function getCommunityVideoMime(mediaUrl) {
  const pathname = String(mediaUrl || "").split("?")[0].toLowerCase();
  if (pathname.endsWith(".mov")) return "video/quicktime";
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".ogg") || pathname.endsWith(".ogv")) return "video/ogg";
  if (pathname.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}

export function logCommunityMediaEvent(post, url, eventName, mediaError) {
  if (!import.meta.env.DEV) return;
  console.info("[CommunityMedia]", {
    postId: post?.id,
    detectedType: isCommunityVideo(post) ? "video" : "image",
    url,
    event: eventName,
    mediaError: mediaError
      ? { code: mediaError.code, message: mediaError.message || "" }
      : null,
  });
}
