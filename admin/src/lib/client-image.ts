const MIB = 1024 * 1024;

export const MAX_ORIGINAL_IMAGE_BYTES = 8 * MIB;
export const MAX_PREPARED_IMAGE_BYTES = Math.floor(3.5 * MIB);
export const MAX_PREPARED_IMAGE_EDGE = 2560;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const IMAGE_EXTENSIONS_BY_TYPE: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
};

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const WEBP_QUALITIES = [0.86, 0.74, 0.62, 0.5, 0.4];
const MAX_SCALE_ROUNDS = 6;

export interface PreparedClientImage {
  compressed: boolean;
  file: File;
  originalSize: number;
}

export function isSupportedImageType(contentType: string) {
  return SUPPORTED_IMAGE_TYPES.has(contentType);
}

export function validateOriginalImage(file: Blob) {
  if (!file.size) throw new Error("图片文件不能为空。");
  if (!isSupportedImageType(file.type)) {
    throw new Error("仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。");
  }
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
    throw new Error("单张原图不能超过 8 MiB。");
  }
  if (file instanceof File) {
    const dot = file.name.lastIndexOf(".");
    const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
    if (!IMAGE_EXTENSIONS_BY_TYPE[file.type]?.includes(extension)) {
      throw new Error("图片扩展名与文件格式不匹配。");
    }
  }
}

export function imageFile(
  blob: Blob,
  name: string,
  contentType = blob.type,
) {
  if (blob instanceof File && blob.name === name && blob.type === contentType) {
    return blob;
  }
  return new File([blob], name, {
    type: contentType,
    lastModified: blob instanceof File ? blob.lastModified : Date.now(),
  });
}

function replaceExtension(name: string, extension: string) {
  const stem = name.replace(/\.[^.]*$/, "") || "image";
  return `${stem}.${extension}`;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  contentType: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === contentType && blob.size) resolve(blob);
        else if (blob) reject(new Error("当前浏览器无法输出 WebP 图片。"));
        else reject(new Error("浏览器无法生成压缩后的图片。"));
      },
      contentType,
      quality,
    );
  });
}

export async function prepareImageForUpload(
  original: File,
): Promise<PreparedClientImage> {
  validateOriginalImage(original);
  if (original.size <= MAX_PREPARED_IMAGE_BYTES) {
    return { compressed: false, file: original, originalSize: original.size };
  }
  if (!COMPRESSIBLE_IMAGE_TYPES.has(original.type)) {
    const format = original.type === "image/gif" ? "GIF" : "AVIF";
    throw new Error(
      `${format} 图片超过 3.5 MiB，系统不会自动转换，以免破坏动画或兼容性；请先手动压缩或转换。`,
    );
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("当前浏览器不支持图片压缩；原图仍保留，请改用新版浏览器后重试。");
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(original);
    if (!bitmap.width || !bitmap.height) {
      throw new Error("无法读取图片尺寸。");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("浏览器无法创建图片压缩画布。");

    const longestEdge = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, MAX_PREPARED_IMAGE_EDGE / longestEdge);
    for (let round = 0; round < MAX_SCALE_ROUNDS; round += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of WEBP_QUALITIES) {
        const blob = await canvasBlob(canvas, "image/webp", quality);
        if (blob.size <= MAX_PREPARED_IMAGE_BYTES) {
          return {
            compressed: true,
            file: new File([blob], replaceExtension(original.name, "webp"), {
              type: "image/webp",
              lastModified: original.lastModified,
            }),
            originalSize: original.size,
          };
        }
      }
      scale *= 0.82;
    }
    throw new Error("图片压缩后仍超过 3.5 MiB，请先手动缩小图片后重试。");
  } catch (error) {
    if (error instanceof Error && /3\.5 MiB|原图仍保留/.test(error.message)) {
      throw error;
    }
    throw new Error(
      `${error instanceof Error ? error.message : "图片压缩失败。"} 原图仍保留，可直接重试。`,
    );
  } finally {
    bitmap?.close();
  }
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("并发数必须是正整数。");
  }
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let firstError: unknown;
  const worker = async () => {
    while (nextIndex < values.length && firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await operation(values[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  if (firstError !== undefined) throw firstError;
  return results;
}
