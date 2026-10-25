import { AppError } from "@/lib/errors";

export const RESIZABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const MIN_THUMBNAIL_WIDTH = 120;
const MAX_THUMBNAIL_WIDTH = 1200;

/** Parses the optional `w` query parameter of the media proxy. */
export function thumbnailWidth(value: string | null) {
  if (!value) return undefined;
  const width = Number(value);
  if (!Number.isInteger(width)) {
    throw new AppError("VALIDATION", "缩略图宽度不合法。", 400);
  }
  return Math.min(MAX_THUMBNAIL_WIDTH, Math.max(MIN_THUMBNAIL_WIDTH, width));
}

/** Adds a width hint to a media proxy URL; other URLs are left alone. */
export function thumbnailUrl(downloadUrl: string, width: number) {
  if (!downloadUrl.startsWith("/api/media/content?")) return downloadUrl;
  return `${downloadUrl}&w=${width}`;
}
