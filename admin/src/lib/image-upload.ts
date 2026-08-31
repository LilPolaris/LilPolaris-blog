import sharp, { type Sharp } from "sharp";
import { AppError } from "@/lib/errors";
import { validateImageFileExtension } from "@/lib/media-name";

export const STAGED_IMAGE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

export const SUPPORTED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

type SupportedImageContentType =
  (typeof SUPPORTED_IMAGE_CONTENT_TYPES)[number];

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectImageContentType(
  bytes: Uint8Array,
): SupportedImageContentType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
    return "image/png";
  }
  if (
    ascii(bytes, 0, 6) === "GIF87a" ||
    ascii(bytes, 0, 6) === "GIF89a"
  ) {
    return "image/gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (
    ascii(bytes, 4, 4) === "ftyp" &&
    ["avif", "avis"].includes(ascii(bytes, 8, 4))
  ) {
    return "image/avif";
  }
  return undefined;
}

export function validateStagedImageBytes(
  bytes: Uint8Array,
  fileName: string,
  reportedContentType: string,
) {
  if (!bytes.byteLength) {
    throw new AppError("UPLOAD_INVALID", "图片文件不能为空。", 400);
  }
  if (bytes.byteLength > STAGED_IMAGE_MAX_BYTES) {
    throw new AppError(
      "UPLOAD_INVALID",
      "准备后的单张图片不能超过 3.5 MiB。",
      413,
    );
  }
  validateImageFileExtension(fileName, reportedContentType);
  if (detectImageContentType(bytes) !== reportedContentType) {
    throw new AppError(
      "UPLOAD_INVALID",
      "图片 MIME 类型与文件内容不一致。",
      400,
    );
  }
  return reportedContentType as SupportedImageContentType;
}

function encoder(
  image: Sharp,
  contentType: SupportedImageContentType,
): Sharp {
  switch (contentType) {
    case "image/jpeg":
      return image.flatten({ background: "#ffffff" }).jpeg({ quality: 90 });
    case "image/png":
      return image.png();
    case "image/gif":
      return image.gif();
    case "image/webp":
      return image.webp({ quality: 90 });
    case "image/avif":
      return image.avif({ quality: 80 });
  }
}

export async function normalizeImageBytes(
  bytes: Uint8Array,
  reportedContentType: string,
) {
  if (
    !SUPPORTED_IMAGE_CONTENT_TYPES.includes(
      reportedContentType as SupportedImageContentType,
    )
  ) {
    throw new AppError(
      "UPLOAD_INVALID",
      "仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。",
      400,
    );
  }

  const contentType = reportedContentType as SupportedImageContentType;
  if (detectImageContentType(bytes) === contentType) {
    return bytes;
  }

  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).rotate();
    return new Uint8Array(await encoder(image, contentType).toBuffer());
  } catch {
    throw new AppError(
      "UPLOAD_INVALID",
      "图片格式标注与实际内容不一致，且无法自动转换为受支持的图片。",
      400,
    );
  }
}
