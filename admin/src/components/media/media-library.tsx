"use client";

import {
  Check,
  Copy,
  ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { mediaMarkdown } from "@/components/media/media-markdown";
import {
  MAX_ORIGINAL_IMAGE_BYTES,
  prepareImageForUpload,
  validateOriginalImage,
} from "@/lib/client-image";
import { formatBytes, formatDate } from "@/lib/format";
import type { MediaAsset, PostKind } from "@/lib/types";

type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "success"
  | "error";

interface UploadTask {
  error?: string;
  file: File;
  id: string;
  preparedSize?: number;
  progress: number;
  retryable?: boolean;
  status: UploadStatus;
}

interface MediaReference {
  kind: PostKind;
  slug: string;
  title: string;
}

type MediaUsage = Record<string, MediaReference[]>;

const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|gif|webp|avif)$/i;

function requestError(response: XMLHttpRequest) {
  try {
    const error = JSON.parse(response.responseText)?.error;
    const message = error?.message || "上传失败，请稍后重试。";
    const requestId =
      error?.requestId || response.getResponseHeader("X-Request-ID");
    return requestId ? `${message}（请求 ID：${requestId}）` : message;
  } catch {
    const requestId = response.getResponseHeader("X-Request-ID");
    return requestId
      ? `上传失败，请稍后重试。（请求 ID：${requestId}）`
      : "上传失败，请稍后重试。";
  }
}

function uploadRequest(
  file: File,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
) {
  return new Promise<MediaAsset>((resolve, reject) => {
    const data = new FormData();
    data.set("file", file);
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) {
      reject(new DOMException("上传已取消。", "AbortError"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("POST", "/api/media");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).data as MediaAsset);
        } catch {
          reject(new Error("服务器返回了无法识别的上传结果。"));
        }
      } else {
        reject(new Error(requestError(xhr)));
      }
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("网络中断，上传失败。"));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("上传已取消。", "AbortError"));
    });
    xhr.send(data);
  });
}

export function MediaLibrary({
  initialMedia,
  limitMb,
}: {
  initialMedia: MediaAsset[];
  limitMb: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<Array<{ file: File; id: string }>>([]);
  const processingRef = useRef(false);
  const uploadSequenceRef = useRef(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [media, setMedia] = useState(initialMedia);
  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState<"all" | "unused">("all");
  const [usageByPath, setUsageByPath] = useState<MediaUsage>();
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [removing, setRemoving] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    return () => {
      queueRef.current = [];
      controller.abort();
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return media.filter(
      (item) =>
        `${item.name} ${item.path}`.toLowerCase().includes(normalized) &&
        (usage === "all" || usageByPath?.[item.path]?.length === 0),
    );
  }, [media, query, usage, usageByPath]);

  function updateUpload(id: string, patch: Partial<UploadTask>) {
    setUploads((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  }

  async function drainQueue() {
    if (processingRef.current) return;
    const uploadController = uploadControllerRef.current;
    if (!uploadController || uploadController.signal.aborted) return;
    processingRef.current = true;
    while (queueRef.current.length && !uploadController.signal.aborted) {
      const task = queueRef.current.shift()!;
      updateUpload(task.id, { status: "preparing", progress: 0, error: undefined });
      try {
        const prepared = await prepareImageForUpload(task.file);
        if (uploadController.signal.aborted) break;
        updateUpload(task.id, {
          preparedSize: prepared.file.size,
          status: "uploading",
        });
        const item = await uploadRequest(
          prepared.file,
          (progress) => updateUpload(task.id, { progress }),
          uploadController.signal,
        );
        if (uploadController.signal.aborted) break;
        setMedia((current) => [item, ...current.filter((entry) => entry.path !== item.path)]);
        setUsageByPath((current) =>
          current ? { ...current, [item.path]: [] } : current,
        );
        updateUpload(task.id, { status: "success", progress: 100 });
      } catch (error) {
        if (uploadController.signal.aborted) break;
        updateUpload(task.id, {
          status: "error",
          error: error instanceof Error ? error.message : "上传失败。",
        });
      }
    }
    processingRef.current = false;
    if (uploadController.signal.aborted) return;
    setMessage("上传队列已处理完成；请检查各文件结果。");
  }

  function enqueueFiles(files: File[]) {
    const nextTasks = files.map((file): UploadTask => {
      uploadSequenceRef.current += 1;
      const id = `${Date.now()}-${uploadSequenceRef.current}-${file.name}-${file.size}`;
      try {
        validateOriginalImage(file);
      } catch (error) {
        return {
          id,
          file,
          progress: 0,
          retryable: false,
          status: "error",
          error: error instanceof Error ? error.message : "无法读取图片。",
        };
      }
      if (file.size > Math.min(limitMb * 1024 * 1024, MAX_ORIGINAL_IMAGE_BYTES)) {
        return {
          id,
          file,
          progress: 0,
          retryable: false,
          status: "error",
          error: `超过 ${Math.min(limitMb, 8)} MiB 原图限制。`,
        };
      }
      if (!IMAGE_FILE_PATTERN.test(file.name)) {
        return {
          id,
          file,
          progress: 0,
          retryable: false,
          status: "error",
          error: "图片扩展名与支持的格式不匹配。",
        };
      }
      queueRef.current.push({ id, file });
      return { id, file, progress: 0, status: "queued" };
    });
    setUploads((current) => [...nextTasks, ...current]);
    setMessage("");
    void drainQueue();
  }

  function retry(task: UploadTask) {
    queueRef.current.push({ id: task.id, file: task.file });
    updateUpload(task.id, { status: "queued", progress: 0, error: undefined });
    void drainQueue();
  }

  async function filterUnused() {
    setUsage("unused");
    if (usageByPath || checkingUsage) return;
    setCheckingUsage(true);
    try {
      const response = await fetch("/api/media?usage=1");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "文章引用检查失败。");
      }
      setUsageByPath((payload.data?.usage || {}) as MediaUsage);
    } catch (error) {
      setUsage("all");
      setMessage(error instanceof Error ? error.message : "文章引用检查失败。");
    } finally {
      setCheckingUsage(false);
    }
  }

  async function remove(item: MediaAsset) {
    const references = usageByPath?.[item.path];
    const reference = references
      ? references.length
        ? `引用文章：${references.map((entry) => entry.title).join("、")}`
        : "未找到正文引用"
      : "尚未运行正文引用检查";
    if (
      !window.confirm(
        `确定删除 ${item.path} 吗？\n\n引用信息：${reference}\n删除会产生 Git Commit。`,
      )
    ) {
      return;
    }
    setRemoving(item.path);
    try {
      const response = await fetch(
        `/api/media?path=${encodeURIComponent(item.path)}&sha=${encodeURIComponent(item.sha)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "删除失败。");
      }
      setMedia((current) => current.filter((entry) => entry.path !== item.path));
      setUsageByPath((current) => {
        if (!current) return current;
        const next = { ...current };
        delete next[item.path];
        return next;
      });
      setMessage("媒体文件已删除。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setRemoving("");
    }
  }

  async function copy(item: MediaAsset, kind: "markdown" | "path") {
    const value = kind === "markdown" ? mediaMarkdown(item) : item.path;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${kind}:${item.path}`);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setMessage("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  return (
    <section className="panel">
      <div className="toolbar">
        <label style={{ position: "relative" }}>
          <Search
            aria-hidden="true"
            size={15}
            style={{ left: 11, position: "absolute", top: 11 }}
          />
          <input
            aria-label="搜索媒体"
            className="input search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名或路径"
            style={{ paddingLeft: 34 }}
            value={query}
          />
        </label>
        <select
          aria-label="按引用状态筛选"
          className="select filter-select"
          onChange={(event) => {
            if (event.target.value === "unused") void filterUnused();
            else setUsage("all");
          }}
          value={usage}
        >
          <option value="all">全部媒体</option>
          <option value="unused">未找到正文引用</option>
        </select>
        <button
          className="button primary"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <UploadCloud size={16} />
          上传图片
        </button>
        <input
          accept=".jpg,.jpeg,.png,.gif,.webp,.avif"
          hidden
          multiple
          onChange={(event) => {
            enqueueFiles([...(event.target.files || [])]);
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
      </div>

      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          enqueueFiles([...event.dataTransfer.files]);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        style={{ margin: 16, minHeight: 110 }}
        tabIndex={0}
      >
        <UploadCloud size={24} />
        <div>
          拖拽多张图片到这里，系统会逐个上传
          <div className="field-help" style={{ marginTop: 4 }}>
            原图最大 {Math.min(limitMb, 8)} MiB；超过 3.5 MiB 的 JPG、PNG、WebP 会在浏览器压缩，GIF/AVIF 请手动压缩
          </div>
        </div>
      </div>

      {uploads.length ? (
        <div className="upload-queue" aria-label="上传队列">
          <div className="upload-queue-header">
            <strong>上传队列</strong>
            <button
              className="button ghost"
              onClick={() =>
                setUploads((current) =>
                  current.filter((task) => task.status !== "success"),
                )
              }
              type="button"
            >
              清除已完成
            </button>
          </div>
          {uploads.map((task) => (
            <div className="upload-task" key={task.id}>
              <div className="upload-task-copy">
                <strong title={task.file.name}>{task.file.name}</strong>
                <span>
                  {formatBytes(task.file.size)}
                  {task.preparedSize && task.preparedSize !== task.file.size
                    ? ` → ${formatBytes(task.preparedSize)}`
                    : ""} · {task.status === "queued"
                    ? "等待上传"
                    : task.status === "preparing"
                      ? "正在检查或压缩"
                    : task.status === "uploading"
                      ? `上传中 ${task.progress}%`
                      : task.status === "success"
                        ? "已上传"
                        : task.error || "上传失败"}
                </span>
              </div>
              <div className="upload-progress" aria-hidden="true">
                <span style={{ width: `${task.progress}%` }} />
              </div>
              {task.status === "error" && task.retryable !== false ? (
                <button className="button" onClick={() => retry(task)} type="button">
                  <RefreshCw size={14} />
                  重试
                </button>
              ) : task.status === "error" ? (
                <span className="badge danger">无法上传</span>
              ) : task.status === "success" ? (
                <Check aria-label="上传成功" className="success-text" size={17} />
              ) : (
                <span className="badge warning">
                  {task.status === "queued"
                    ? "排队中"
                    : task.status === "preparing"
                      ? "准备中"
                      : "上传中"}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {usage === "unused" ? (
        <div className="media-filter-note">
          {checkingUsage
            ? "正在读取文章正文并检查图片引用…"
            : "已按当前文章与草稿正文检查引用；删除前仍建议确认动态模板或主题配置中没有使用。"}
        </div>
      ) : null}

      {filtered.length ? (
        <div className="media-grid">
          {filtered.map((item) => {
            const references = usageByPath?.[item.path];
            const unused = references?.length === 0;
            return (
              <article className="media-card" key={item.path}>
                <div className="media-preview">
                  {item.downloadUrl ? (
                    // Authenticated media is served through the protected proxy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={item.name} loading="lazy" src={item.downloadUrl} />
                  ) : (
                    <ImageIcon size={28} />
                  )}
                </div>
                <div className="media-copy">
                  <div className="media-name" title={item.path}>{item.name}</div>
                  <div className={`list-secondary${unused ? " danger-text" : ""}`}>
                    {references
                      ? references.length
                        ? `引用：${references.map((entry) => entry.title).join("、")}`
                        : "未找到正文引用"
                      : item.scope === "post"
                        ? `文章资源：${item.postSlug || "未知"}`
                        : "公共媒体 · 尚未检查引用"}
                  </div>
                  <div className="list-secondary">
                    {formatBytes(item.size)} · {item.uploadedAt ? formatDate(item.uploadedAt) : "GitHub 文件"}
                  </div>
                  <div className="row-actions" style={{ marginTop: 9 }}>
                    <button
                      className="button"
                      onClick={() => copy(item, "markdown")}
                      style={{ flex: 1 }}
                      type="button"
                    >
                      {copied === `markdown:${item.path}` ? <Check size={14} /> : <Copy size={14} />}
                      {copied === `markdown:${item.path}` ? "已复制 Markdown" : "复制 Markdown"}
                    </button>
                    <button
                      aria-label={`复制 ${item.name} 的仓库路径`}
                      className="icon-button"
                      onClick={() => copy(item, "path")}
                      title="复制仓库路径"
                      type="button"
                    >
                      {copied === `path:${item.path}` ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button
                      aria-label={`删除 ${item.name}`}
                      className="icon-button danger"
                      disabled={removing === item.path}
                      onClick={() => remove(item)}
                      type="button"
                    >
                      {removing === item.path ? <X size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          description={
            usage === "unused"
              ? checkingUsage
                ? "正在读取文章正文并检查图片引用。"
                : "所有媒体都在当前文章或草稿正文中被引用。"
              : media.length
                ? "没有符合搜索条件的媒体文件。"
                : "上传公共图片，或在文章编辑器中上传文章资源。"
          }
          title={usage === "unused" ? "没有疑似未使用资源" : media.length ? "没有匹配结果" : "媒体库为空"}
        />
      )}
      {message ? <div aria-live="polite" className="toast">{message}</div> : null}
    </section>
  );
}
