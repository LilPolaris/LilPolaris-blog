import type { PendingMedia } from "@/lib/types";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const MAX_PENDING_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_PENDING_BUNDLE_BYTES = 32 * 1024 * 1024;

export function pendingMediaName(
  contentType: string,
  date = new Date(),
  random = crypto.randomUUID().slice(0, 6),
) {
  const extension = MIME_EXTENSIONS[contentType];
  if (!extension) throw new Error("仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。");
  const pad = (value: number) => String(value).padStart(2, "0");
  return `paste-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${random}.${extension}`;
}

export function createPendingMedia(file: File): PendingMedia {
  if (!MIME_EXTENSIONS[file.type]) {
    throw new Error("仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。");
  }
  if (file.size > MAX_PENDING_MEDIA_BYTES) {
    throw new Error("单张图片不能超过 8 MiB。");
  }
  return {
    id: crypto.randomUUID(),
    name: pendingMediaName(file.type),
    contentType: file.type,
    size: file.size,
    blob: file,
    alt: "图片描述",
    previewUrl: URL.createObjectURL(file),
  };
}

export function assetImageTag(media: Pick<PendingMedia, "name" | "alt">) {
  return `{% asset_img "${media.name}" "${media.alt}" %}`;
}

export function isPendingMediaReferenced(body: string, media: PendingMedia) {
  return body.includes(`asset_img "${media.name}"`);
}
