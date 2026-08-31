import type { PendingMedia } from "@/lib/types";
import {
  MAX_ORIGINAL_IMAGE_BYTES,
  validateOriginalImage,
} from "@/lib/client-image";

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
};

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const BLOG_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export const MAX_PENDING_MEDIA_BYTES = MAX_ORIGINAL_IMAGE_BYTES;
export const MAX_PENDING_BUNDLE_BYTES = 32 * 1024 * 1024;

function blogDate(date: Date) {
  const parts = Object.fromEntries(
    BLOG_DATE_FORMATTER
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

function sanitizedOriginalStem(originalName: string) {
  const fileName = originalName.replace(/^.*[\\/]/, "");
  const dot = fileName.lastIndexOf(".");
  const originalStem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const stem = originalStem
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  if (!stem) return "image";
  return WINDOWS_RESERVED_NAME.test(stem) ? `image-${stem}` : stem;
}

function extensionFor(originalName: string, contentType: string) {
  const allowed = MIME_EXTENSIONS[contentType];
  if (!allowed) throw new Error("仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。");
  const fileName = originalName.replace(/^.*[\\/]/, "");
  const dot = fileName.lastIndexOf(".");
  const candidate = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return allowed.includes(candidate) ? candidate : allowed[0];
}

export function uniquePendingMediaName(
  preferredName: string,
  occupiedNames: Iterable<string>,
) {
  const occupied = new Set(
    [...occupiedNames].map((name) => name.toLocaleLowerCase("en-US")),
  );
  if (!occupied.has(preferredName.toLocaleLowerCase("en-US"))) {
    return preferredName;
  }
  const dot = preferredName.lastIndexOf(".");
  const stem = dot > 0 ? preferredName.slice(0, dot) : preferredName;
  const extension = dot > 0 ? preferredName.slice(dot) : "";
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (!occupied.has(candidate.toLocaleLowerCase("en-US"))) return candidate;
  }
}

export function pendingMediaName(
  originalName: string,
  contentType: string,
  date = new Date(),
  random = crypto.randomUUID().slice(0, 6),
  occupiedNames: Iterable<string> = [],
) {
  const shortCode = random.toLowerCase();
  if (!/^[a-f0-9]{6}$/.test(shortCode)) {
    throw new Error("图片短码必须是 6 位十六进制字符。");
  }
  const preferredName = `${blogDate(date)}-${sanitizedOriginalStem(originalName)}-${shortCode}.${extensionFor(originalName, contentType)}`;
  return uniquePendingMediaName(preferredName, occupiedNames);
}

export function createPendingMedia(
  file: File,
  options: {
    date?: Date;
    occupiedNames?: Iterable<string>;
    random?: string;
  } = {},
): PendingMedia {
  validateOriginalImage(file);
  return {
    id: crypto.randomUUID(),
    name: pendingMediaName(
      file.name,
      file.type,
      options.date,
      options.random,
      options.occupiedNames,
    ),
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
  const escapedName = media.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\{%\\s*asset_img\\s+(["'])${escapedName}\\1(?=\\s|%\\})`,
  ).test(body);
}
