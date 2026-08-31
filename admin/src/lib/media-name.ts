import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";

export const IMAGE_EXTENSIONS_BY_CONTENT_TYPE = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
} as const;

export type SupportedImageContentType =
  keyof typeof IMAGE_EXTENSIONS_BY_CONTENT_TYPE;

const WINDOWS_RESERVED_STEMS = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const PREPARED_MEDIA_NAME =
  /^\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{6}\.(?:jpe?g|png|gif|webp|avif)$/;
const MAX_SANITIZED_STEM_LENGTH = 96;

function fileNameOnly(name: string) {
  return name.normalize("NFKC").replaceAll("\\", "/").split("/").at(-1) || "";
}

function splitFileName(name: string) {
  const fileName = fileNameOnly(name);
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? { stem: fileName.slice(0, dot), extension: fileName.slice(dot + 1) }
    : { stem: fileName, extension: "" };
}

function dateInShanghai(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}`;
}

export function supportedImageContentType(value: string) {
  return Object.hasOwn(IMAGE_EXTENSIONS_BY_CONTENT_TYPE, value)
    ? (value as SupportedImageContentType)
    : undefined;
}

export function validateImageFileExtension(
  fileName: string,
  contentType: string,
) {
  const supportedType = supportedImageContentType(contentType);
  if (!supportedType) {
    throw new AppError(
      "UPLOAD_INVALID",
      "仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。",
      400,
    );
  }
  const extension = splitFileName(fileName).extension.toLowerCase();
  if (
    !extension ||
    !(IMAGE_EXTENSIONS_BY_CONTENT_TYPE[supportedType] as readonly string[]).includes(
      extension,
    )
  ) {
    throw new AppError(
      "UPLOAD_INVALID",
      "文件扩展名与图片 MIME 类型不一致。",
      400,
    );
  }
  return extension;
}

export function sanitizeMediaStem(originalName: string) {
  const { stem } = splitFileName(originalName);
  let sanitized = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SANITIZED_STEM_LENGTH)
    .replace(/-+$/g, "");
  if (!sanitized || WINDOWS_RESERVED_STEMS.test(sanitized)) {
    sanitized = "image";
  }
  return sanitized;
}

export function prepareMediaFileName(input: {
  originalName: string;
  uploadedFileName: string;
  contentType: string;
  now?: Date;
  shortcode?: string;
}) {
  const extension = validateImageFileExtension(
    input.uploadedFileName,
    input.contentType,
  );
  const shortcode = input.shortcode || randomBytes(3).toString("hex");
  if (!/^[0-9a-f]{6}$/i.test(shortcode)) {
    throw new AppError("VALIDATION", "图片短码格式不合法。", 400);
  }
  const name = `${dateInShanghai(input.now || new Date())}-${sanitizeMediaStem(
    input.originalName,
  )}-${shortcode.toLowerCase()}.${extension}`;
  assertPreparedMediaName(name);
  return name;
}

export function prepareOrReuseMediaFileName(input: {
  originalName: string;
  uploadedFileName: string;
  contentType: string;
  now?: Date;
  shortcode?: string;
}) {
  const candidate = fileNameOnly(input.uploadedFileName);
  if (PREPARED_MEDIA_NAME.test(candidate)) {
    assertPreparedMediaName(candidate);
    validateImageFileExtension(candidate, input.contentType);
    return candidate;
  }
  return prepareMediaFileName(input);
}

export function assertPreparedMediaName(name: string) {
  if (name.length > 140 || !PREPARED_MEDIA_NAME.test(name)) {
    throw new AppError("UPLOAD_INVALID", "图片文件名格式不合法。", 400);
  }
  return name;
}

export function uniqueMediaName(
  preparedName: string,
  reservedNames: Iterable<string>,
) {
  assertPreparedMediaName(preparedName);
  const reserved = new Set(
    Array.from(reservedNames, (name) => name.toLocaleLowerCase("en-US")),
  );
  if (!reserved.has(preparedName.toLocaleLowerCase("en-US"))) {
    return preparedName;
  }
  const dot = preparedName.lastIndexOf(".");
  const stem = preparedName.slice(0, dot);
  const extension = preparedName.slice(dot);
  let suffix = 2;
  while (
    reserved.has(`${stem}-${suffix}${extension}`.toLocaleLowerCase("en-US"))
  ) {
    suffix += 1;
  }
  return `${stem}-${suffix}${extension}`;
}

export function replaceAssetImageReference(
  body: string,
  referenceName: string,
  finalName: string,
) {
  if (referenceName === finalName) return body;
  return body.replace(
    /({%\s*asset_img\s+)(?:"([^"]+)"|'([^']+)')/g,
    (match, prefix: string, doubleQuoted?: string, singleQuoted?: string) => {
      const current = doubleQuoted ?? singleQuoted;
      if (current !== referenceName) return match;
      const quote = doubleQuoted === undefined ? "'" : '"';
      return `${prefix}${quote}${finalName}${quote}`;
    },
  );
}
