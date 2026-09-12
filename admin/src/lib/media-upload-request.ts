import type { MediaAsset } from "@/lib/types";

export const MEDIA_UPLOAD_TIMEOUT_MS = 60_000;

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly resultUnknown = false,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

function requestError(response: XMLHttpRequest) {
  let message = "上传失败，请稍后重试。";
  let requestId = response.getResponseHeader("X-Request-ID");
  try {
    const error = JSON.parse(response.responseText)?.error;
    message = error?.message || message;
    requestId = error?.requestId || requestId;
  } catch {
    // Proxies can return non-JSON responses.
  }
  return requestId ? `${message}（请求 ID：${requestId}）` : message;
}

export function uploadMediaRequest(
  file: File,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
) {
  return new Promise<MediaAsset>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("上传已取消。", "AbortError"));
      return;
    }
    const data = new FormData();
    data.set("file", file);
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const uncertain = (message: string) => {
      cleanup();
      reject(
        new MediaUploadError(
          `${message}服务器可能已收到图片，请先刷新媒体库核对。`,
          true,
        ),
      );
    };
    try {
      xhr.open("POST", "/api/media");
      xhr.timeout = MEDIA_UPLOAD_TIMEOUT_MS;
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable)
          onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const asset = JSON.parse(xhr.responseText).data as MediaAsset;
            if (!asset?.path || !asset.sha || !asset.name)
              throw new Error("Invalid asset");
            resolve(asset);
          } catch {
            uncertain("未能识别上传结果。");
          }
        } else if (
          xhr.status >= 500 ||
          xhr.status === 0 ||
          xhr.status === 408
        ) {
          uncertain(`${requestError(xhr)} `);
        } else {
          reject(new MediaUploadError(requestError(xhr)));
        }
      });
      xhr.addEventListener("timeout", () => uncertain("上传等待超过 60 秒。"));
      xhr.addEventListener("error", () => uncertain("上传连接中断。"));
      xhr.addEventListener("abort", () => {
        cleanup();
        reject(new DOMException("上传已取消。", "AbortError"));
      });
      signal.addEventListener("abort", abort, { once: true });
      xhr.send(data);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
