export const COMMUNITY_IMAGE_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_VIDEO_INPUT_MAX_BYTES = 60 * 1024 * 1024;
export const COMMUNITY_VIDEO_OUTPUT_MAX_BYTES = 15 * 1024 * 1024;

export function formatCommunityFileSize(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
}
