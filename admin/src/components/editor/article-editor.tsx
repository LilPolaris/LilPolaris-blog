"use client";

import { redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  EditorView as CodeMirrorView,
  type EditorView,
} from "@codemirror/view";
import { del, get, set } from "idb-keyval";
import {
  Bold,
  Braces,
  ChevronLeft,
  Code2,
  Eye,
  FileClock,
  Heading2,
  ImagePlus,
  Images,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Redo2,
  Table2,
  Trash2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { livePreviewExtension } from "@/components/editor/live-preview-extension";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { formatBlogTimestamp } from "@/lib/blog-time";
import {
  imageFile,
  mapWithConcurrency,
  prepareImageForUpload,
} from "@/lib/client-image";
import {
  articleContentForAi,
  kindForRegularSave,
  migrateRecoveredFrontMatter,
  replaceUploadedMediaNames,
  slugFromTitle,
  type RecoverableFrontMatter,
  validateEditorSlug,
} from "@/lib/article-editor-utils";
import {
  assetImageTag,
  createPendingMedia,
  isPendingMediaReferenced,
  MAX_PENDING_BUNDLE_BYTES,
} from "@/lib/pending-media";
import type {
  AiMetadataSuggestion,
  EditableFrontMatter,
  EditorContext,
  EditorMode,
  PendingMedia,
  PostBundleMutationResult,
  PostDocument,
  PostKind,
  ResolvedPostPreset,
} from "@/lib/types";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
});
const EDITOR_FLASH_KEY = "lilpolaris-editor-flash";

type SaveState =
  | "idle"
  | "local-saving"
  | "local-saved"
  | "remote-saving"
  | "remote-saved"
  | "error";

interface RecoveryPayload {
  savedAt: number;
  baseSha?: string;
  body: string;
  frontMatter: RecoverableFrontMatter;
  pendingMedia?: PendingMedia[];
}

const SLASH_COMMANDS = [
  { label: "大标题", detail: "# 标题", insert: "# 标题" },
  { label: "二级标题", detail: "## 标题", insert: "## 标题" },
  { label: "引用", detail: "> 引用内容", insert: "> 引用内容" },
  { label: "待办事项", detail: "- [ ] 待办", insert: "- [ ] 待办" },
  {
    label: "代码块",
    detail: "带语言的代码块",
    insert: "```text\n代码\n```",
  },
  {
    label: "表格",
    detail: "两列表格",
    insert: "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |",
  },
  {
    label: "Mermaid",
    detail: "流程图",
    insert: "```mermaid\ngraph LR\n  A --> B\n```",
  },
  { label: "公式", detail: "KaTeX 块公式", insert: "$$\nE = mc^2\n$$" },
];

function encodePath(path: string) {
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function responseError(
  response: Response,
  fallback = "保存失败，请稍后重试。",
) {
  const data = await response.json().catch(() => ({}));
  const requestId =
    data?.error?.requestId || response.headers.get("X-Request-ID") || undefined;
  const baseMessage = data?.error?.message || fallback;
  return {
    message: requestId ? `${baseMessage}（请求 ID：${requestId}）` : baseMessage,
    code: data?.error?.code,
    details: data?.error?.details,
    requestId,
  };
}

interface StagedMediaResponse {
  contentType: string;
  id: string;
  preparedName: string;
  receipt: string;
  size: number;
}

function boundedOriginalName(name: string) {
  if (name.length <= 200) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  return `${name.slice(0, Math.max(1, 200 - extension.length))}${extension}`;
}

async function stagePendingMedia(media: PendingMedia) {
  const storedName = media.blob instanceof File ? media.blob.name : media.name;
  const originalName = boundedOriginalName(storedName);
  const original = imageFile(media.blob, storedName, media.contentType);
  const prepared = await prepareImageForUpload(original);
  const preparedExtension = prepared.file.name.split(".").at(-1) || "webp";
  const preparedReferenceName = media.name.replace(
    /.[^.]+$/,
    `.${preparedExtension.toLowerCase()}`,
  );
  const preparedFile = imageFile(
    prepared.file,
    preparedReferenceName,
    prepared.file.type,
  );
  const form = new FormData();
  form.set("file", preparedFile, preparedFile.name);
  form.set("id", media.id);
  form.set("referenceName", media.name);
  form.set("originalName", originalName);
  const response = await fetch("/api/posts/media/stage", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      (await responseError(response, `图片 ${media.name} 暂存失败。`)).message,
    );
  }
  const payload = await response.json();
  const staged = (payload.data || payload) as StagedMediaResponse;
  if (
    staged.id !== media.id ||
    !staged.preparedName ||
    !staged.receipt ||
    staged.size > Math.floor(3.5 * 1024 * 1024)
  ) {
    throw new Error(`图片 ${media.name} 的暂存响应不完整。`);
  }
  return staged;
}

function readingStats(markdownBody: string) {
  const plain = markdownBody
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>|\{%.+?%\}|[#*_>`~[\]()|-]/g, " ");
  const cjk = plain.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)
    ?.length || 0;
  const words = plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  const count = cjk + words;
  return { count, minutes: Math.max(1, Math.ceil(count / 400)) };
}

export function ArticleEditor({
  initial,
  defaults,
  blogTimezone,
  publicBlogUrl,
  editorContext,
  defaultEditorMode,
  returnTo,
}: {
  initial?: PostDocument;
  defaults: EditableFrontMatter;
  blogTimezone: string;
  publicBlogUrl: string;
  editorContext: EditorContext;
  defaultEditorMode: EditorMode;
  returnTo: string;
}) {
  const router = useRouter();
  const [frontMatter, setFrontMatter] = useState(
    initial?.frontMatter || defaults,
  );
  const [body, setBody] = useState(initial?.body || "");
  const [remote, setRemote] = useState(
    initial
      ? {
          id: initial.id,
          path: initial.path,
          sha: initial.sha,
          headSha: initial.headSha,
        }
      : undefined,
  );
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [stagedAssetUrls, setStagedAssetUrls] = useState<
    Record<string, string>
  >({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<
    "save" | "reload" | "delete" | "ai" | null
  >(null);
  const operationRef = useRef<typeof operation>(null);
  const editRevisionRef = useRef(0);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [editorMode, setEditorMode] =
    useState<EditorMode>(defaultEditorMode);
  const [showProperties, setShowProperties] = useState(true);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    message: string;
    remoteSource?: string;
  }>();
  const editorView = useRef<EditorView | null>(null);
  const recoveryKey = useMemo(
    () =>
      `lilpolaris-recovery:${remote?.path || initial?.path || "new-article"}`,
    [initial?.path, remote?.path],
  );
  const recoveryKeyRef = useRef(recoveryKey);
  const recoverySnapshotRef = useRef<RecoveryPayload | undefined>(undefined);
  const previousRecoveryKeyRef = useRef(recoveryKey);
  const mountedRef = useRef(true);
  const fallbackSlug = useMemo(() => {
    const timestamp = (defaults.date || defaults.updated)
      .replace(/\D/g, "")
      .slice(0, 14);
    return `post-${timestamp || "new"}`;
  }, [defaults.date, defaults.updated]);
  const currentSlug = remote?.path.split("/").at(-1)?.replace(/\.md$/, "");

  const assetUrls = useMemo(
    () => ({
      ...Object.fromEntries(
        pendingMedia
          .filter((media) => media.previewUrl)
          .map((media) => [media.name, media.previewUrl!]),
      ),
      ...stagedAssetUrls,
    }),
    [pendingMedia, stagedAssetUrls],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recovery = recoverySnapshotRef.current;
      if (recovery) {
        void set(recoveryKeyRef.current, {
          ...recovery,
          savedAt: Date.now(),
        });
      }
    };
  }, []);

  useEffect(() => {
    const flash = window.sessionStorage.getItem(EDITOR_FLASH_KEY);
    if (!flash) return;
    window.sessionStorage.removeItem(EDITOR_FLASH_KEY);
    const timer = window.setTimeout(() => {
      setMessage(flash);
      setSaveState("remote-saved");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    recoveryKeyRef.current = recoveryKey;
    recoverySnapshotRef.current = dirty
      ? {
          savedAt: Date.now(),
          baseSha: remote?.sha,
          body,
          frontMatter,
          pendingMedia,
        }
      : undefined;
  }, [body, dirty, frontMatter, pendingMedia, recoveryKey, remote?.sha]);

  useEffect(() => {
    const previousKey = previousRecoveryKeyRef.current;
    if (previousKey === recoveryKey) return;
    previousRecoveryKeyRef.current = recoveryKey;
    const recovery = recoverySnapshotRef.current;
    if (!recovery) {
      void del(previousKey);
      return;
    }
    void set(recoveryKey, { ...recovery, savedAt: Date.now() })
      .then(() => del(previousKey))
      .catch(() => {
        setMessage("文章已保存，但本地恢复副本迁移失败，请尽快再次保存。");
      });
  }, [recoveryKey]);

  useEffect(() => {
    const remembered = window.localStorage.getItem("lilpolaris-editor-mode");
    if (remembered === "live" || remembered === "source") {
      const timer = window.setTimeout(() => setEditorMode(remembered), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const closeOnMobile = (event: MediaQueryListEvent) => {
      if (event.matches) setShowProperties(false);
    };
    media.addEventListener("change", closeOnMobile);
    const timer = media.matches
      ? window.setTimeout(() => setShowProperties(false), 0)
      : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      media.removeEventListener("change", closeOnMobile);
    };
  }, []);

  const changeEditorMode = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
    window.localStorage.setItem("lilpolaris-editor-mode", mode);
  }, []);

  const queueImages = useCallback(
    (files: File[], view: EditorView, position?: number) => {
      if (operation) {
        setMessage("正在提交当前版本，请等待完成后再插入图片。");
        return false;
      }
      try {
        const occupiedNames = new Set(pendingMedia.map((media) => media.name));
        const additions = files.map((file) => {
          const media = createPendingMedia(file, { occupiedNames });
          occupiedNames.add(media.name);
          return {
            ...media,
            alt: file.name.replace(/\.[^.]+$/, "") || "图片描述",
          };
        });
        const total =
          pendingMedia.reduce(
            (sum, media) => sum + media.size,
            0,
          ) + additions.reduce((sum, media) => sum + media.size, 0);
        if (total > MAX_PENDING_BUNDLE_BYTES) {
          throw new Error("一篇文章待上传图片总量不能超过 32 MiB。");
        }
        const insert = additions.map(assetImageTag).join("\n\n");
        const range = view.state.selection.main;
        const from = position ?? range.from;
        const to = position ?? range.to;
        const insertion = `${from > 0 && view.state.doc.sliceString(from - 1, from) !== "\n" ? "\n\n" : ""}${insert}\n`;
        view.dispatch({
          changes: {
            from,
            to,
            insert: insertion,
          },
          selection: { anchor: from + insertion.length },
          scrollIntoView: true,
        });
        setPendingMedia((current) => [...current, ...additions]);
        setMessage(
          `${additions.length} 张图片已放入本地恢复副本，保存文章时会一并提交。`,
        );
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "无法读取粘贴的图片。",
        );
        return false;
      }
    },
    [operation, pendingMedia],
  );

  const editorExtensions = useMemo(() => {
    const extensions = [
      markdown(),
      CodeMirrorView.lineWrapping,
      CodeMirrorView.domEventHandlers({
        paste(event, view) {
          const clipboard = event.clipboardData;
          const imageFiles = [...(clipboard?.items || [])]
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (imageFiles.length) {
            event.preventDefault();
            return queueImages(imageFiles, view);
          }
          const text = clipboard?.getData("text/plain").trim() || "";
          const range = view.state.selection.main;
          if (
            range.from !== range.to &&
            /^https?:\/\/\S+$/i.test(text)
          ) {
            event.preventDefault();
            const selected = view.state.sliceDoc(range.from, range.to);
            view.dispatch({
              changes: {
                from: range.from,
                to: range.to,
                insert: `[${selected}](${text})`,
              },
              selection: { anchor: range.from + selected.length + text.length + 4 },
            });
            return true;
          }
          return false;
        },
        drop(event, view) {
          const files = [...(event.dataTransfer?.files || [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!files.length) return false;
          event.preventDefault();
          return queueImages(
            files,
            view,
            view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined,
          );
        },
      }),
      CodeMirrorView.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet) return;
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        const beforeCursor = update.state.sliceDoc(line.from, head);
        const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
        setSlashQuery(match ? match[1].toLowerCase() : null);
      }),
      CodeMirrorView.theme({
        "&": {
          backgroundColor: "var(--surface)",
          color: "var(--foreground)",
          fontSize: "16px",
        },
        ".cm-content": {
          caretColor: "var(--foreground)",
          margin: "0 auto",
          maxWidth: "860px",
          padding: "28px clamp(18px, 5vw, 68px) 160px",
          width: "100%",
        },
        ".cm-gutters": {
          backgroundColor: "var(--surface-muted)",
          borderRight: "1px solid var(--border)",
          color: "var(--muted-foreground)",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)",
        },
        ".cm-line": { minHeight: "1.7em" },
      }),
    ];
    if (editorMode === "live") {
      extensions.push(
        ...livePreviewExtension({
          postPath: remote?.path,
          assetUrls,
        }),
      );
    }
    return extensions;
  }, [assetUrls, editorMode, queueImages, remote?.path]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const recovery = await get<RecoveryPayload>(recoveryKey);
        if (!active || !recovery) return;
        const recoveredFrontMatter = migrateRecoveredFrontMatter(
          recovery.frontMatter,
          initial?.frontMatter || defaults,
        );
        const differs =
          recovery.body !== (initial?.body || "") ||
          JSON.stringify(recoveredFrontMatter) !==
            JSON.stringify(initial?.frontMatter || defaults) ||
          Boolean(recovery.pendingMedia?.length);
        if (
          differs &&
          window.confirm(
            `发现 ${new Date(recovery.savedAt).toLocaleString("zh-CN")} 保存的本地恢复副本，是否恢复？`,
          )
        ) {
          setBody(recovery.body);
          setFrontMatter(recoveredFrontMatter);
          setSlugEdited(Boolean(recoveredFrontMatter.slug));
          const recoveredMedia = (recovery.pendingMedia || []).map((media) => ({
              ...media,
              previewUrl: URL.createObjectURL(media.blob),
            }));
          setPendingMedia(recoveredMedia);
          setDirty(true);
          setSaveState("local-saved");
        }
      } catch {
        if (active) {
          setMessage("本地恢复副本读取失败；仍可继续编辑并保存到远程。");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [defaults, initial, recoveryKey]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await set(recoveryKey, {
            savedAt: Date.now(),
            baseSha: remote?.sha,
            body,
            frontMatter,
            pendingMedia,
          } satisfies RecoveryPayload);
          setSaveState("local-saved");
        } catch {
          setSaveState("error");
          setMessage("本地恢复副本保存失败，请尽快重试远程保存。");
        }
      })();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [body, dirty, frontMatter, pendingMedia, recoveryKey, remote?.sha]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    let restoringHistory = false;
    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin === window.location.origin &&
        destination.href !== window.location.href &&
        !window.confirm("还有未保存的修改，确定离开编辑器吗？本地恢复副本会保留。")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const guardHistoryNavigation = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      if (
        !window.confirm(
          "还有未保存的修改，确定离开编辑器吗？本地恢复副本会保留。",
        )
      ) {
        restoringHistory = true;
        window.history.forward();
      }
    };
    document.addEventListener("click", guardInternalNavigation, true);
    window.addEventListener("popstate", guardHistoryNavigation);
    return () => {
      document.removeEventListener("click", guardInternalNavigation, true);
      window.removeEventListener("popstate", guardHistoryNavigation);
    };
  }, [dirty]);

  function updateFrontMatter<K extends keyof EditableFrontMatter>(
    key: K,
    value: EditableFrontMatter[K],
  ) {
    editRevisionRef.current += 1;
    setFrontMatter((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaveState("local-saving");
  }

  function changeBody(value: string) {
    editRevisionRef.current += 1;
    setBody(value);
    setDirty(true);
    setSaveState("local-saving");
  }

  function changeTitle(value: string) {
    editRevisionRef.current += 1;
    setFrontMatter((current) => ({
      ...current,
      title: value,
      slug:
        !remote && !slugEdited
          ? slugFromTitle(value, fallbackSlug)
          : current.slug,
    }));
    setDirty(true);
    setSaveState("local-saving");
  }

  function changeSlug(value: string) {
    setSlugEdited(true);
    updateFrontMatter("slug", value);
  }

  function regenerateSlug() {
    setSlugEdited(true);
    updateFrontMatter("slug", slugFromTitle(frontMatter.title, fallbackSlug));
  }

  async function suggestMetadata() {
    if (operationRef.current) return;
    const title = frontMatter.title.trim();
    if (!title) {
      setMessage("请先输入文章标题，再让 AI 生成文章属性。");
      return;
    }
    if (
      remote &&
      !window.confirm(
        "AI 建议会覆盖当前英文文件名、标签和分类，但不会自动保存或发布。是否继续？",
      )
    ) {
      return;
    }
    operationRef.current = "ai";
    const submittedRevision = editRevisionRef.current;
    setOperation("ai");
    setMessage("");
    try {
      const response = await fetch("/api/ai/article-metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          currentSlug,
          content: articleContentForAi(body),
          excerpt: frontMatter.excerpt.slice(0, 2_000),
          currentTags: frontMatter.tags
            .slice(0, 12)
            .map((tag) => tag.slice(0, 80)),
          currentCategories: frontMatter.categories
            .slice(0, 5)
            .map((path) => path.slice(0, 5).map((part) => part.slice(0, 80))),
        }),
      });
      if (!response.ok) {
        const error = await responseError(
          response,
          "AI 文章属性生成失败，请稍后重试。",
        );
        throw new Error(error.message);
      }
      const payload = await response.json();
      if (editRevisionRef.current !== submittedRevision) {
        setMessage("生成期间文章已被修改，因此没有覆盖当前属性；可以再次点击生成。");
        return;
      }
      const suggestion = payload.data as AiMetadataSuggestion;
      editRevisionRef.current += 1;
      setFrontMatter((current) => ({
        ...current,
        slug: suggestion.slug,
        tags: suggestion.tags,
        categories: suggestion.categories,
      }));
      setSlugEdited(true);
      setDirty(true);
      setSaveState("local-saving");
      setMessage(
        `${payload.model || "AI"} 已生成英文文件名、标签和分类；请确认后再保存或发布。`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "AI 文章属性生成失败，请稍后重试。",
      );
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setOperation(null);
    }
  }

  function changeFirstPublishedAt(value: string) {
    editRevisionRef.current += 1;
    setFrontMatter((current) => ({
      ...current,
      date: value,
      firstPublishedAt: value,
    }));
    setDirty(true);
    setSaveState("local-saving");
  }

  const insert = useCallback(
    (prefix: string, suffix = "", fallback = "文本") => {
      const view = editorView.current;
      if (!view) return;
      const range = view.state.selection.main;
      const selected = view.state.sliceDoc(range.from, range.to) || fallback;
      const value = `${prefix}${selected}${suffix}`;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: value },
        selection: {
          anchor: range.from + prefix.length,
          head: range.from + prefix.length + selected.length,
        },
      });
      view.focus();
    },
    [],
  );

  const insertRaw = useCallback((value: string) => {
    const view = editorView.current;
    if (!view) return false;
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: value },
      selection: { anchor: range.from + value.length },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }, []);

  function updatePendingMediaAlt(id: string, alt: string) {
    const media = pendingMedia.find((item) => item.id === id);
    if (!media) return;
    editRevisionRef.current += 1;
    setPendingMedia((current) =>
      current.map((item) => (item.id === id ? { ...item, alt } : item)),
    );
    setBody((current) =>
      current.replaceAll(assetImageTag(media), assetImageTag({ ...media, alt })),
    );
    setDirty(true);
    setSaveState("local-saving");
  }

  async function save(targetKind: PostKind, force = false) {
    if (operationRef.current) return;
    setAttemptedSave(true);
    const titleError = frontMatter.title.trim()
      ? ""
      : "文章标题不能为空。";
    const slugError = validateEditorSlug(
      frontMatter.slug,
      editorContext.occupiedSlugs,
      currentSlug,
    );
    if (titleError || slugError) {
      setSaveState("error");
      setMessage(titleError || slugError);
      return;
    }
    const normalizedSlug = frontMatter.slug.trim().replace(/\.md$/i, "");
    const existingSlug = remote?.path.split("/").at(-1)?.replace(/\.md$/, "");
    if (
      remote &&
      existingSlug !== normalizedSlug &&
      !window.confirm(
        `文件名将从 ${existingSlug} 改为 ${normalizedSlug}，公开 URL 与同名资源目录会一起改变。是否继续？`,
      )
    ) {
      return;
    }
    operationRef.current = "save";
    const submittedRevision = editRevisionRef.current;
    setOperation("save");
    setSaveState("remote-saving");
    setMessage("");
    setConflict(undefined);
    try {
      const referencedMedia = pendingMedia.filter((media) =>
        isPendingMediaReferenced(body, media),
      );
      let stagedCount = 0;
      if (referencedMedia.length) {
        setMessage(`正在准备并暂存 ${referencedMedia.length} 张图片…`);
      }
      const stagedMedia = await mapWithConcurrency(
        referencedMedia,
        3,
        async (media) => {
          const staged = await stagePendingMedia(media);
          stagedCount += 1;
          if (mountedRef.current) {
            setMessage(
              `图片暂存中：${stagedCount}/${referencedMedia.length}。全部完成后才会提交文章。`,
            );
          }
          return staged;
        },
      );
      const referencedById = new Map(
        referencedMedia.map((media) => [media.id, media]),
      );
      setStagedAssetUrls(
        Object.fromEntries(
          stagedMedia.flatMap((staged) => {
            const source = referencedById.get(staged.id);
            if (!source?.previewUrl) return [];
            return [
              [source.name, source.previewUrl],
              [staged.preparedName, source.previewUrl],
            ];
          }),
        ),
      );
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      const response = await fetch("/api/posts/bundle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          post: {
            currentPath: remote?.path,
            expectedSha: remote?.sha,
            expectedHeadSha: remote?.headSha,
            kind: targetKind,
            slug: normalizedSlug,
            body,
            frontMatter: {
              ...frontMatter,
              slug: normalizedSlug,
              draft: targetKind === "draft",
            },
            force,
          },
          mediaReceipts: stagedMedia.map((media) => media.receipt),
        }),
      });
      if (!mountedRef.current) return;
      if (!response.ok) {
        const error = await responseError(response);
        if (error.code === "CONFLICT") {
          setConflict({
            message: error.message,
            remoteSource:
              typeof error.details?.remoteSource === "string"
                ? error.details.remoteSource
                : undefined,
          });
        }
        throw new Error(error.message);
      }
      const payload = await response.json();
      const result = payload.data as PostBundleMutationResult;
      const id = encodePath(result.path);
      const editedWhileSaving = editRevisionRef.current !== submittedRevision;
      const submittedMediaIds = new Set(
        referencedMedia.map((media) => media.id),
      );
      const unreferencedMediaCount = pendingMedia.length - referencedMedia.length;
      setRemote({
        id,
        path: result.path,
        sha: result.sha,
        headSha: result.headSha,
      });
      let successMessage: string;
      if (editedWhileSaving) {
        setBody((current) =>
          replaceUploadedMediaNames(
            current,
            referencedMedia,
            result.mediaNamesById,
          ),
        );
        setFrontMatter((current) => ({
          ...current,
          draft: targetKind === "draft",
          updated: formatBlogTimestamp(new Date(), blogTimezone),
        }));
        setDirty(true);
        setSaveState("local-saving");
        successMessage =
          "发起保存时的版本已提交；保存期间的新修改仍保留在本地，请再次保存。";
        if (unreferencedMediaCount) {
          successMessage += ` ${unreferencedMediaCount} 张未被提交的图片仍在本地恢复副本中。`;
        }
      } else {
        setBody(result.body);
        setFrontMatter((current) => ({
          ...current,
          slug: normalizedSlug,
          draft: targetKind === "draft",
          updated: formatBlogTimestamp(new Date(), blogTimezone),
        }));
        successMessage =
          payload.warning ||
          (targetKind === "draft"
            ? "正文与图片已在同一个 Git Commit 中保存为草稿。"
            : "正文与图片已原子提交，部署流程将由工作流处理。");
        if (unreferencedMediaCount) {
          setDirty(true);
          setSaveState("local-saving");
          successMessage += ` ${unreferencedMediaCount} 张未被正文引用的图片仍保留在本地恢复副本中。`;
        } else {
          setDirty(false);
          recoverySnapshotRef.current = undefined;
          setSaveState("remote-saved");
          try {
            await del(recoveryKey);
          } catch {
            successMessage += " 本地恢复副本未能清除，但远程保存已成功。";
          }
        }
      }
      setMessage(successMessage);
      if (!initial || initial.path !== result.path) {
        const search = new URLSearchParams({ returnTo });
        const editorUrl = `/posts/${id}/edit?${search}`;
        if (editedWhileSaving || unreferencedMediaCount) {
          window.history.replaceState(window.history.state, "", editorUrl);
        } else {
          window.sessionStorage.setItem(EDITOR_FLASH_KEY, successMessage);
          router.replace(editorUrl);
        }
      }
      if (!editedWhileSaving) router.refresh();
      window.setTimeout(() => {
        referencedMedia.forEach((media) => {
          if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
        });
        if (mountedRef.current) {
          setPendingMedia((current) =>
            current.filter((media) => !submittedMediaIds.has(media.id)),
          );
          setStagedAssetUrls({});
        }
      }, 1_500);
    } catch (error) {
      if (!mountedRef.current) return;
      setStagedAssetUrls({});
      setSaveState("error");
      setMessage(
        `${error instanceof Error ? error.message : "保存失败，请稍后重试。"} 本地图片与恢复副本已保留，可直接重试。`,
      );
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setOperation(null);
    }
  }

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save(kindForRegularSave(frontMatter.draft));
      } else if (modifier && event.key === "Enter") {
        event.preventDefault();
        void save("post");
      } else if (
        modifier &&
        event.shiftKey &&
        event.key.toLowerCase() === "m"
      ) {
        event.preventDefault();
        changeEditorMode(editorMode === "live" ? "source" : "live");
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });

  async function reloadRemote() {
    if (!remote || operationRef.current) return;
    operationRef.current = "reload";
    setOperation("reload");
    setMessage("");
    try {
      const response = await fetch(`/api/posts/${remote.id}`);
      if (!mountedRef.current) return;
      if (!response.ok) {
        throw new Error(
          (await responseError(response, "远程版本加载失败，请稍后重试。"))
            .message,
        );
      }
      const document = (await response.json()).data as PostDocument;
      setBody(document.body);
      setFrontMatter(document.frontMatter);
      pendingMedia.forEach((media) => {
        if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
      });
      setPendingMedia([]);
      setRemote({
        id: document.id,
        path: document.path,
        sha: document.sha,
        headSha: document.headSha,
      });
      setDirty(false);
      recoverySnapshotRef.current = undefined;
      setConflict(undefined);
      setSaveState("remote-saved");
      try {
        await del(recoveryKey);
      } catch {
        setMessage("远程版本已加载，但本地恢复副本未能清除。");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveState("error");
      setMessage(
        error instanceof Error ? error.message : "远程版本加载失败，请稍后重试。",
      );
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setOperation(null);
    }
  }

  async function deleteArticle() {
    if (!remote || operationRef.current) return;
    if (!window.confirm("确定删除这篇文章吗？关联资源将保留，可在媒体库中单独处理。")) {
      return;
    }
    operationRef.current = "delete";
    setOperation("delete");
    setMessage("");
    try {
      const response = await fetch(
        `/api/posts/${remote.id}?sha=${encodeURIComponent(remote.sha)}&deleteAssets=false`,
        { method: "DELETE" },
      );
      if (!mountedRef.current) return;
      if (!response.ok) {
        throw new Error(
          (await responseError(response, "删除失败，请稍后重试。")).message,
        );
      }
      recoverySnapshotRef.current = undefined;
      try {
        await del(recoveryKey);
      } catch {
        // The remote deletion succeeded, so local cleanup must not block leaving.
      }
      router.push(returnTo);
      router.refresh();
    } catch (error) {
      if (!mountedRef.current) return;
      setMessage(
        error instanceof Error ? error.message : "删除失败，请稍后重试。",
      );
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setOperation(null);
    }
  }

  function moveToDraft() {
    if (
      !remote ||
      frontMatter.draft ||
      !window.confirm(
        "这会取消发布，文章将从公开站点下线并移入草稿。确定继续吗？",
      )
    ) {
      return;
    }
    void save("draft");
  }

  function applyPreset(preset: ResolvedPostPreset) {
    if (
      remote &&
      !window.confirm(
        `将模板“${preset.label}”应用到已有文章会修改文件名、标题、标签、分类和布局。是否继续？`,
      )
    ) {
      return;
    }
    editRevisionRef.current += 1;
    setFrontMatter((current) => ({
      ...current,
      slug: preset.suggestedSlug,
      title: preset.suggestedTitle,
      tags: preset.tags,
      categories: preset.categories,
      layout: preset.layout || current.layout,
    }));
    setSlugEdited(true);
    setDirty(true);
    setSaveState("local-saving");
  }

  function toggleTag(tag: string) {
    updateFrontMatter(
      "tags",
      frontMatter.tags.includes(tag)
        ? frontMatter.tags.filter((item) => item !== tag)
        : [...frontMatter.tags, tag],
    );
  }

  function toggleCategory(path: string[]) {
    const key = path.join(" > ");
    const exists = frontMatter.categories.some(
      (category) => category.join(" > ") === key,
    );
    updateFrontMatter(
      "categories",
      exists
        ? frontMatter.categories.filter(
            (category) => category.join(" > ") !== key,
          )
        : [...frontMatter.categories, path],
    );
  }

  function runSlashCommand(command: (typeof SLASH_COMMANDS)[number]) {
    const view = editorView.current;
    if (!view) return;
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const before = view.state.sliceDoc(line.from, head);
    const match = before.match(/\/[^\s/]*$/);
    if (!match || match.index === undefined) return;
    const from = line.from + match.index;
    view.dispatch({
      changes: { from, to: head, insert: command.insert },
      selection: { anchor: from + command.insert.length },
    });
    setSlashQuery(null);
    view.focus();
  }

  const stats = useMemo(() => readingStats(body), [body]);
  const outline = useMemo(() => {
    return [...body.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match) => ({
      level: match[1].length,
      label: match[2].replace(/[*_`[\]]/g, ""),
      position: match.index,
    }));
  }, [body]);
  const filteredCommands =
    slashQuery === null
      ? []
      : SLASH_COMMANDS.filter((command) =>
          `${command.label} ${command.detail}`
            .toLowerCase()
            .includes(slashQuery),
        );
  const statusText =
    operation === "ai"
      ? "AI 正在生成文章属性…"
      : operation === "reload"
      ? "正在加载远程版本…"
      : operation === "delete"
        ? "正在删除…"
        : {
            idle: dirty ? "存在未保存修改" : "未修改",
            "local-saving": "正在保存本地副本…",
            "local-saved": `已保存到本地${pendingMedia.length ? ` · ${pendingMedia.length} 张图片待提交` : ""}`,
            "remote-saving": "正在原子提交…",
            "remote-saved": "已保存到 GitHub",
            error: "保存失败",
          }[saveState];
  const isBusy = operation !== null;
  const publicUrl = `${publicBlogUrl}/posts/${frontMatter.slug || "…"}/`;
  const titleError = frontMatter.title.trim() ? "" : "文章标题不能为空。";
  const slugError = validateEditorSlug(
    frontMatter.slug,
    editorContext.occupiedSlugs,
    currentSlug,
  );

  return (
    <div className="editor-shell">
      <h1 className="sr-only">{initial ? "编辑文章" : "新建文章"}</h1>
      <header className="editor-header">
        <Link
          aria-label="返回文章列表"
          className="icon-button ghost"
          href={returnTo}
        >
          <ChevronLeft size={19} />
        </Link>
        <div className="editor-identity">
          <label>
            <span>大标题</span>
            <input
              aria-label="文章标题"
              aria-invalid={attemptedSave && Boolean(titleError)}
              className="editor-title-input"
              onChange={(event) => changeTitle(event.target.value)}
              placeholder="输入文章标题"
              value={frontMatter.title}
            />
            {attemptedSave && titleError ? (
              <small className="rename-warning" role="alert">
                {titleError}
              </small>
            ) : null}
          </label>
          <label>
            <span>英文文件名</span>
            <input
              aria-label="英文文件名"
              aria-invalid={Boolean(slugError) && (slugEdited || attemptedSave)}
              className="editor-slug-input"
              onChange={(event) => changeSlug(event.target.value)}
              placeholder="english-file-name"
              spellCheck={false}
              value={frontMatter.slug}
            />
            {slugError && (slugEdited || attemptedSave) ? (
              <small className="rename-warning" role="alert">
                {slugError}
              </small>
            ) : (
              <small title={publicUrl}>{publicUrl}</small>
            )}
            <div className="editor-slug-actions">
              <button
                className="preset-button"
                disabled={isBusy || !frontMatter.title.trim()}
                onClick={() => void suggestMetadata()}
                title="根据中文标题、当前正文和历史已发布文章生成建议；必要时可创建新标签或分类"
                type="button"
              >
                <WandSparkles size={13} />
                {operation === "ai" ? "正在生成…" : "AI 智能生成"}
              </button>
              <button
                className="preset-button"
                onClick={regenerateSlug}
                title="不调用模型，仅按标题中的英文字母生成文件名"
                type="button"
              >
                本地规则生成
              </button>
            </div>
          </label>
        </div>
        <span
          aria-live="polite"
          className={`save-status ${saveState === "error" ? "error" : saveState === "remote-saved" ? "saved" : ""}`}
        >
          <span className="status-dot" />
          {statusText}
        </span>
        <button
          aria-label={showProperties ? "收起文章属性" : "展开文章属性"}
          className="icon-button"
          onClick={() => setShowProperties((value) => !value)}
          type="button"
        >
          {showProperties ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
        {!remote || frontMatter.draft ? (
          <button
            className="button"
            disabled={isBusy}
            onClick={() => save("draft")}
            type="button"
          >
            保存草稿
          </button>
        ) : null}
        <button
          className="button primary"
          disabled={isBusy}
          onClick={() => save("post")}
          type="button"
        >
          {remote && !frontMatter.draft ? "更新" : "发布"}
        </button>
      </header>

      <div className="preset-bar">
        <span>快捷模板</span>
        {editorContext.presets.map((preset) => (
          <button
            className="preset-button"
            key={preset.id}
            onClick={() => applyPreset(preset)}
            title={`${preset.suggestedSlug} / ${preset.suggestedTitle}`}
            type="button"
          >
            <WandSparkles size={13} />
            {preset.label}
            <small>{preset.suggestedTitle}</small>
          </button>
        ))}
        {currentSlug && currentSlug !== frontMatter.slug ? (
          <span className="rename-warning">
            保存后将同步移动公开 URL 和文章资源目录
          </span>
        ) : null}
      </div>

      <div className="editor-formatbar" role="toolbar" aria-label="Markdown 格式">
        <div className="view-tabs" aria-label="编辑器显示模式" role="group">
          <button
            className={`button${editorMode === "live" ? " active" : ""}`}
            onClick={() => changeEditorMode("live")}
            title="Ctrl+Shift+M"
            type="button"
          >
            <Eye size={14} />
            Live Preview
          </button>
          <button
            className={`button${editorMode === "source" ? " active" : ""}`}
            onClick={() => changeEditorMode("source")}
            title="Ctrl+Shift+M"
            type="button"
          >
            <Code2 size={14} />
            源码
          </button>
        </div>
        <span className="toolbar-divider" />
        <button aria-label="撤销" className="format-button" onClick={() => editorView.current && undo(editorView.current)} type="button">
          <Undo2 size={16} />
        </button>
        <button aria-label="重做" className="format-button" onClick={() => editorView.current && redo(editorView.current)} type="button">
          <Redo2 size={16} />
        </button>
        <button aria-label="二级标题" className="format-button" onClick={() => insert("## ", "", "标题")} type="button">
          <Heading2 size={16} />
        </button>
        <button aria-label="加粗" className="format-button" onClick={() => insert("**", "**")} type="button">
          <Bold size={16} />
        </button>
        <button aria-label="斜体" className="format-button" onClick={() => insert("*", "*")} type="button">
          <Italic size={16} />
        </button>
        <button aria-label="引用" className="format-button" onClick={() => insert("> ", "", "引用内容")} type="button">
          <Quote size={16} />
        </button>
        <button aria-label="无序列表" className="format-button" onClick={() => insert("- ", "", "列表项")} type="button">
          <List size={16} />
        </button>
        <button aria-label="有序列表" className="format-button" onClick={() => insert("1. ", "", "列表项")} type="button">
          <ListOrdered size={16} />
        </button>
        <button aria-label="行内代码" className="format-button" onClick={() => insert("`", "`", "代码")} type="button">
          <Braces size={16} />
        </button>
        <button aria-label="链接" className="format-button" onClick={() => insert("[", "](https://)", "链接文字")} type="button">
          <LinkIcon size={16} />
        </button>
        <button aria-label="表格" className="format-button" onClick={() => insert("\n| 列一 | 列二 |\n| --- | --- |\n| ", " | 内容 |\n", "内容")} type="button">
          <Table2 size={16} />
        </button>
        <label className="format-button" title="选择图片；也可以直接 Ctrl+V 或拖入">
          <ImagePlus size={16} />
          <input
            accept=".jpg,.jpeg,.png,.gif,.webp,.avif"
            aria-label="选择并插入图片"
            hidden
            multiple
            onChange={(event) => {
              if (editorView.current && event.target.files?.length) {
                queueImages([...event.target.files], editorView.current);
              }
              event.target.value = "";
            }}
            type="file"
          />
        </label>
        <MediaPickerDialog
          currentPostSlug={currentSlug}
          onSelect={({ asset, markdown }) => {
            if (insertRaw(markdown)) {
              setMessage(`已插入 ${asset.name}，图片说明也已写入正文。`);
            } else {
              setMessage("编辑器尚未准备好，请稍后重试。");
            }
          }}
          trigger={
            <button
              aria-label="从媒体库插入图片"
              className="format-button"
              title="从媒体库选择已有图片"
              type="button"
            >
              <Images size={16} />
            </button>
          }
        />
        <span className="editor-stats">
          {stats.count} 字 · 约 {stats.minutes} 分钟 · Ctrl+S 保持当前状态保存 · Ctrl+Enter 发布
        </span>
      </div>

      <div className="editor-workspace">
        <div
          aria-label="正文编辑区"
          className="editor-pane"
          role="region"
          tabIndex={0}
        >
          <CodeMirror
            basicSetup={{
              bracketMatching: true,
              closeBrackets: true,
              foldGutter: editorMode === "source",
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              history: true,
              lineNumbers: editorMode === "source",
            }}
            extensions={editorExtensions}
            height="100%"
            onChange={changeBody}
            onCreateEditor={(view) => {
              editorView.current = view;
              view.contentDOM.setAttribute(
                "aria-label",
                "Markdown 正文编辑器",
              );
            }}
            placeholder={"开始写作…\n输入 / 可以打开快捷命令"}
            value={body}
          />
          {filteredCommands.length ? (
            <div className="slash-menu" role="group" aria-label="Markdown 快捷命令">
              {filteredCommands.map((command) => (
                <button key={command.label} onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(command)} type="button">
                  <strong>{command.label}</strong>
                  <span>{command.detail}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {showProperties ? (
          <>
          <button
            aria-label="关闭文章属性"
            className="property-backdrop"
            onClick={() => setShowProperties(false)}
            type="button"
          />
          <aside className="property-panel" aria-label="文章属性">
            <div className="property-section">
              <div className="property-heading">文章属性</div>
              <label className="field">
                <span className="field-label">首次上线时间（精确到秒）</span>
                <input
                  className="input"
                  onChange={(event) => changeFirstPublishedAt(event.target.value)}
                  pattern="\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"
                  placeholder="首次发布自动写入；手动格式 YYYY-MM-DD HH:mm:ss"
                  value={frontMatter.firstPublishedAt}
                />
              </label>
              <label className="field">
                <span className="field-label">标签</span>
                <input
                  className="input"
                  onChange={(event) => updateFrontMatter("tags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
                  placeholder="Hexo, 写作, 教程"
                  value={frontMatter.tags.join(", ")}
                />
              </label>
              <div className="suggestion-row">
                {editorContext.tags.slice(0, 10).map((item) => (
                  <button className={frontMatter.tags.includes(item.label) ? "active" : ""} key={item.label} onClick={() => toggleTag(item.label)} type="button">
                    {item.label}{item.count ? ` · ${item.count}` : ""}
                  </button>
                ))}
              </div>
              <label className="field">
                <span className="field-label">分类层级</span>
                <textarea
                  className="textarea"
                  onChange={(event) => updateFrontMatter("categories", event.target.value.split(/\r?\n/).map((line) => line.split(">").map((item) => item.trim()).filter(Boolean)).filter((path) => path.length))}
                  placeholder={"教程 > 分享\n随笔"}
                  value={frontMatter.categories.map((path) => path.join(" > ")).join("\n")}
                />
              </label>
              <div className="suggestion-row">
                {editorContext.categories.slice(0, 10).map((item) => {
                  const path = Array.isArray(item.value) ? item.value : [item.value];
                  const active = frontMatter.categories.some((category) => category.join(" > ") === path.join(" > "));
                  return (
                    <button className={active ? "active" : ""} key={item.label} onClick={() => toggleCategory(path)} type="button">
                      {item.label}{item.count ? ` · ${item.count}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="property-section">
              <label className="field">
                <span className="field-label">摘要</span>
                <textarea className="textarea" onChange={(event) => updateFrontMatter("excerpt", event.target.value)} value={frontMatter.excerpt} />
              </label>
              <label className="field">
                <span className="field-label">封面</span>
                <input className="input" onChange={(event) => updateFrontMatter("cover", event.target.value)} placeholder="/img/cover.jpg" value={frontMatter.cover} />
              </label>
              <label className="field">
                <span className="field-label">布局</span>
                <input className="input" onChange={(event) => updateFrontMatter("layout", event.target.value)} value={frontMatter.layout} />
              </label>
              <label className="field">
                <span className="field-label">固定链接覆盖</span>
                <input className="input" onChange={(event) => updateFrontMatter("permalink", event.target.value)} placeholder="posts/custom-url/" value={frontMatter.permalink} />
              </label>
            </div>

            {pendingMedia.length ? (
              <div className="property-section">
                <div className="property-heading">待提交图片说明</div>
                {pendingMedia.map((media) => (
                  <label className="field" key={media.id}>
                    <span className="field-label" title={media.name}>
                      {media.name}
                    </span>
                    <input
                      aria-label={`${media.name} 的图片说明`}
                      className="input"
                      maxLength={300}
                      onChange={(event) =>
                        updatePendingMediaAlt(media.id, event.target.value)
                      }
                      placeholder="说明图片内容，便于无障碍阅读"
                      value={media.alt}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            {outline.length ? (
              <div className="property-section">
                <div className="property-heading">文章目录</div>
                <nav className="editor-outline">
                  {outline.map((heading, index) => (
                    <button
                      key={`${heading.position}-${index}`}
                      onClick={() => {
                        editorView.current?.dispatch({
                          selection: { anchor: heading.position },
                          scrollIntoView: true,
                        });
                        editorView.current?.focus();
                      }}
                      style={{ paddingLeft: 8 + (heading.level - 1) * 13 }}
                      type="button"
                    >
                      {heading.label}
                    </button>
                  ))}
                </nav>
              </div>
            ) : null}

            <div className="property-section">
              {remote && !frontMatter.draft ? (
                <a className="button" href={publicUrl} rel="noreferrer" target="_blank">
                  <Eye size={15} />
                  查看公开页面
                </a>
              ) : null}
              {remote && !frontMatter.draft ? (
                <button
                  className="button danger"
                  disabled={isBusy}
                  onClick={moveToDraft}
                  type="button"
                >
                  <FileClock size={15} />
                  取消发布并移入草稿
                </button>
              ) : null}
              {remote ? (
                <button
                  className="button danger"
                  disabled={isBusy}
                  onClick={deleteArticle}
                  type="button"
                >
                  <Trash2 size={15} />
                  删除文章
                </button>
              ) : null}
            </div>
          </aside>
          </>
        ) : null}
      </div>

      {message ? <div aria-live="polite" className="toast">{message}</div> : null}

      {conflict ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
          <section className="panel dialog-card">
            <div className="panel-header">
              <h2 className="panel-title" id="conflict-title">远程版本已更新</h2>
            </div>
            <div className="panel-body">
              <p>{conflict.message}</p>
              {conflict.remoteSource ? (
                <details>
                  <summary>查看远程原文</summary>
                  <pre className="remote-source">{conflict.remoteSource}</pre>
                </details>
              ) : null}
              <div className="button-group dialog-actions">
                <button className="button" disabled={isBusy} onClick={reloadRemote} type="button">重新加载远程版本</button>
                <button className="button danger" disabled={isBusy} onClick={() => save(kindForRegularSave(frontMatter.draft), true)} type="button">强制保存本地版本</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
