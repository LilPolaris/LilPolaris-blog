"use client";

import { redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import {
  EditorView as CodeMirrorView,
  keymap,
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
  Heading3,
  ImagePlus,
  Images,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Redo2,
  Strikethrough,
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
import { ChipInput, type ChipSuggestion } from "@/components/editor/chip-input";
import {
  applySlashCommand,
  selectSlashIndex,
  SLASH_ACTION_EVENT,
  slashCommandExtension,
  slashMenuState,
  type SlashCommand,
} from "@/components/editor/slash-commands";
import { livePreviewExtension } from "@/components/editor/live-preview-extension";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { Toast } from "@/components/toast";
import { formatBlogTimestamp } from "@/lib/blog-time";
import { formatRelative } from "@/lib/format";
import {
  insertBlock,
  insertLink,
  toggleInlineMarker,
  toggleLinePrefix,
} from "@/lib/markdown-commands";
import { pastedHtmlToMarkdown, shouldConvertPastedHtml } from "@/lib/paste-html";
import { markdownOutline } from "@/lib/markdown-outline";
import { readBrowserValue, writeBrowserValue } from "@/lib/browser-storage";
import {
  imageFile,
  mapWithConcurrency,
  prepareImageForUpload,
} from "@/lib/client-image";
import {
  articleContentForAi,
  encodePostPathId,
  kindForRegularSave,
  migrateRecoveredFrontMatter,
  recoveryKeyForPath,
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
  CategoryPath,
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
  loading: () => (
    <div aria-busy="true" aria-label="正在加载编辑器" className="editor-loading">
      <div className="skeleton" style={{ width: "92%" }} />
      <div className="skeleton" style={{ width: "78%" }} />
      <div className="skeleton" style={{ width: "86%" }} />
      <div className="skeleton" style={{ width: "40%" }} />
    </div>
  ),
});
const EDITOR_FLASH_KEY = "lilpolaris-editor-flash";
const PANEL_PREFERENCE_KEY = "lilpolaris-editor-panel";
const FOCUS_MODE_KEY = "lilpolaris-editor-focus";

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

type FormatCommandId =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "quote"
  | "bullet"
  | "ordered"
  | "task"
  | "link"
  | "table"
  | "divider";

const FORMAT_COMMANDS: Record<
  FormatCommandId,
  (state: EditorState) => TransactionSpec
> = {
  h1: (state) => toggleLinePrefix(state, "# "),
  h2: (state) => toggleLinePrefix(state, "## "),
  h3: (state) => toggleLinePrefix(state, "### "),
  bold: (state) => toggleInlineMarker(state, "**"),
  italic: (state) => toggleInlineMarker(state, "*"),
  strike: (state) => toggleInlineMarker(state, "~~"),
  code: (state) => toggleInlineMarker(state, "`", "代码"),
  quote: (state) => toggleLinePrefix(state, "> "),
  bullet: (state) => toggleLinePrefix(state, "- "),
  ordered: (state) => toggleLinePrefix(state, "1. "),
  task: (state) => toggleLinePrefix(state, "- [ ] "),
  link: (state) => insertLink(state),
  table: (state) =>
    insertBlock(state, "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |", 2),
  divider: (state) => insertBlock(state, "---"),
};

type ToolbarItem =
  | "|"
  | {
      id: FormatCommandId | "undo" | "redo";
      label: string;
      shortcut?: string;
      icon: typeof Bold;
    };

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: "undo", label: "撤销", shortcut: "Ctrl+Z", icon: Undo2 },
  { id: "redo", label: "重做", shortcut: "Ctrl+Y", icon: Redo2 },
  "|",
  { id: "h2", label: "二级标题", shortcut: "Ctrl+Alt+2", icon: Heading2 },
  { id: "h3", label: "三级标题", shortcut: "Ctrl+Alt+3", icon: Heading3 },
  { id: "bold", label: "加粗", shortcut: "Ctrl+B", icon: Bold },
  { id: "italic", label: "斜体", shortcut: "Ctrl+I", icon: Italic },
  { id: "strike", label: "删除线", shortcut: "Ctrl+Shift+X", icon: Strikethrough },
  { id: "code", label: "行内代码", shortcut: "Ctrl+E", icon: Braces },
  "|",
  { id: "quote", label: "引用", icon: Quote },
  { id: "bullet", label: "无序列表", icon: List },
  { id: "ordered", label: "有序列表", icon: ListOrdered },
  { id: "task", label: "待办列表", icon: ListChecks },
  "|",
  { id: "link", label: "链接", shortcut: "Ctrl+K", icon: LinkIcon },
  { id: "table", label: "表格", icon: Table2 },
  { id: "divider", label: "分割线", icon: Minus },
];

function formatKey(id: FormatCommandId) {
  return (view: EditorView) => {
    view.dispatch(FORMAT_COMMANDS[id](view.state));
    return true;
  };
}

/** Markdown formatting shortcuts shared with the toolbar. */
const FORMAT_KEYMAP = keymap.of([
  { key: "Mod-b", run: formatKey("bold") },
  { key: "Mod-i", run: formatKey("italic") },
  { key: "Mod-e", run: formatKey("code") },
  { key: "Mod-Shift-x", run: formatKey("strike") },
  { key: "Mod-k", run: formatKey("link") },
  { key: "Mod-Alt-1", run: formatKey("h1") },
  { key: "Mod-Alt-2", run: formatKey("h2") },
  { key: "Mod-Alt-3", run: formatKey("h3") },
]);

const encodePath = encodePostPathId;

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
  const [focusMode, setFocusMode] = useState(false);
  const [slashMenu, setSlashMenu] = useState<{
    commands: SlashCommand[];
    index: number;
    top: number;
    left: number;
  } | null>(null);
  const [selectionLength, setSelectionLength] = useState(0);
  const [recoveryOffer, setRecoveryOffer] = useState<RecoveryPayload>();
  const [lastRemoteSaveAt, setLastRemoteSaveAt] = useState<number>();
  const [clock, setClock] = useState(() => Date.now());
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const slashOpenRef = useRef(false);
  const [conflict, setConflict] = useState<{
    message: string;
    remoteSource?: string;
  }>();
  const editorView = useRef<EditorView | null>(null);
  const recoveryKey = useMemo(
    () => recoveryKeyForPath(remote?.path || initial?.path),
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
        void Promise.resolve().then(() => set(recoveryKeyRef.current, {
          ...recovery,
          savedAt: Date.now(),
        })).catch(() => undefined); // Autosave reports failures while mounted.
      }
    };
  }, []);

  useEffect(() => {
    // Consume the one-time message inside the timer: an effect that is set up
    // twice (React Strict Mode) must not clear it before it is shown.
    const timer = window.setTimeout(() => {
      const flash = readBrowserValue("session", EDITOR_FLASH_KEY);
      if (!flash) return;
      writeBrowserValue("session", EDITOR_FLASH_KEY, null);
      setMessage(flash);
      setSaveState("remote-saved");
      setLastRemoteSaveAt(Date.now());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The first save of a new article remounts the editor on its new URL;
  // focus mode survives that and plain reloads within the tab.
  useEffect(() => {
    if (readBrowserValue("session", FOCUS_MODE_KEY) !== "on") return;
    const timer = window.setTimeout(() => setFocusMode(true), 0);
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
      void Promise.resolve().then(() => del(previousKey)).catch(() => undefined);
      return;
    }
    void set(recoveryKey, { ...recovery, savedAt: Date.now() })
      .then(() => del(previousKey))
      .catch(() => {
        setMessage("文章已保存，但本地恢复副本迁移失败，请尽快再次保存。");
      });
  }, [recoveryKey]);

  useEffect(() => {
    const remembered = readBrowserValue("local", "lilpolaris-editor-mode");
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
    // Narrow desktop windows start with the panel closed so the text gets the
    // room; an explicit choice is remembered across articles.
    const remembered = readBrowserValue("local", PANEL_PREFERENCE_KEY);
    const open = media.matches
      ? false
      : remembered === "open"
        ? true
        : remembered === "closed"
          ? false
          : window.matchMedia("(min-width: 1280px)").matches;
    const timer = window.setTimeout(() => setShowProperties(open), 0);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", closeOnMobile);
    };
  }, []);

  const toggleProperties = useCallback((next?: boolean) => {
    setShowProperties((current) => {
      const value = next ?? !current;
      if (!window.matchMedia("(max-width: 900px)").matches) {
        writeBrowserValue("local", PANEL_PREFERENCE_KEY, value ? "open" : "closed");
      }
      return value;
    });
  }, []);

  // Focus mode hides the admin chrome around the editor. It is a document
  // level flag because the sidebar and top bar belong to the server layout.
  useEffect(() => {
    const root = document.documentElement;
    writeBrowserValue("session", FOCUS_MODE_KEY, focusMode ? "on" : null);
    if (focusMode) root.dataset.editorFocus = "true";
    else delete root.dataset.editorFocus;
    return () => {
      delete root.dataset.editorFocus;
    };
  }, [focusMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const base = initial ? "编辑文章" : "新建文章";
    const name = frontMatter.title.trim() || base;
    document.title = `${dirty ? "● " : ""}${name} · LilPolaris Blog Admin`;
  }, [dirty, frontMatter.title, initial]);

  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [frontMatter.title, focusMode, showProperties]);

  const changeEditorMode = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
    writeBrowserValue("local", "lilpolaris-editor-mode", mode);
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

  const runToolbarCommand = useCallback(
    (id: FormatCommandId | "undo" | "redo") => {
      const view = editorView.current;
      if (!view) return;
      if (id === "undo") undo(view);
      else if (id === "redo") redo(view);
      else view.dispatch(FORMAT_COMMANDS[id](view.state));
      view.focus();
    },
    [],
  );

  // Slash menu commands that need the page (file picker, media dialog).
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<SlashCommand["action"]>).detail;
      if (action === "image") imageInputRef.current?.click();
      else if (action === "media") mediaTriggerRef.current?.click();
    };
    pane.addEventListener(SLASH_ACTION_EVENT, onAction);
    return () => pane.removeEventListener(SLASH_ACTION_EVENT, onAction);
  }, []);

  useEffect(() => {
    slashOpenRef.current = Boolean(slashMenu);
  }, [slashMenu]);

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
          const html = clipboard?.getData("text/html") || "";
          // Rich text from web pages or Word becomes Markdown; Ctrl+Shift+V
          // still pastes plain text because browsers then omit text/html.
          if (html && shouldConvertPastedHtml(html, [...(clipboard?.types || [])])) {
            const converted = pastedHtmlToMarkdown(html);
            if (converted) {
              event.preventDefault();
              const isBlock =
                converted.includes("\n") || /^(?:#{1,6} |[-*>] |\d+\. |\||```)/.test(converted);
              view.dispatch(
                isBlock
                  ? insertBlock(view.state, converted)
                  : view.state.replaceSelection(converted),
                { scrollIntoView: true, userEvent: "input.paste" },
              );
              return true;
            }
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
      ...slashCommandExtension(),
      FORMAT_KEYMAP,
      CodeMirrorView.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet && !update.transactions.some((tr) => tr.effects.length)) {
          return;
        }
        const selection = update.state.selection.main;
        setSelectionLength(selection.to - selection.from);
        const menu = slashMenuState(update.state);
        if (!menu) {
          setSlashMenu(null);
          return;
        }
        update.view.requestMeasure({
          read: (view) => {
            const coords = view.coordsAtPos(menu.anchor);
            const pane = view.dom.closest(".editor-pane");
            if (!coords || !pane) return null;
            const box = pane.getBoundingClientRect();
            const below = coords.bottom - box.top + pane.scrollTop + 6;
            return {
              left: Math.min(
                Math.max(12, coords.left - box.left - 12),
                Math.max(12, box.width - 300),
              ),
              top:
                box.bottom - coords.bottom < 300
                  ? Math.max(8, coords.top - box.top + pane.scrollTop - 330)
                  : below,
            };
          },
          write: (position) => {
            setSlashMenu(position ? { ...menu, ...position } : null);
          },
        });
      }),
      CodeMirrorView.theme({
        "&": {
          backgroundColor: "var(--surface)",
          color: "var(--foreground)",
          fontSize: "16px",
        },
        ".cm-content": {
          caretColor: "var(--foreground)",
          padding: "4px 0 45vh",
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
        if (differs && editRevisionRef.current === 0) {
          setRecoveryOffer({ ...recovery, frontMatter: recoveredFrontMatter });
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

  function acceptRecovery() {
    const recovery = recoveryOffer;
    if (!recovery) return;
    setRecoveryOffer(undefined);
    editRevisionRef.current += 1;
    setBody(recovery.body);
    setFrontMatter(recovery.frontMatter as EditableFrontMatter);
    setSlugEdited(Boolean(recovery.frontMatter.slug));
    const recoveredMedia = (recovery.pendingMedia || []).map((media) => ({
      ...media,
      previewUrl: URL.createObjectURL(media.blob),
    }));
    setPendingMedia(recoveredMedia);
    setDirty(true);
    setSaveState("local-saved");
    setMessage("已恢复本机保存的版本，确认无误后记得保存到 GitHub。");
  }

  function discardRecovery() {
    setRecoveryOffer(undefined);
    void del(recoveryKey).catch(() => undefined);
  }

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
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
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
      if (titleError) titleRef.current?.focus();
      else toggleProperties(true);
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
      setLastRemoteSaveAt(Date.now());
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
          writeBrowserValue("session", EDITOR_FLASH_KEY, successMessage);
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
      } else if (modifier && event.key === ".") {
        event.preventDefault();
        setFocusMode((value) => !value);
      } else if (modifier && event.key === "\\") {
        event.preventDefault();
        toggleProperties();
      } else if (event.key === "Escape" && focusMode && !slashOpenRef.current) {
        setFocusMode(false);
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

  const stats = useMemo(() => readingStats(body), [body]);
  const outline = useMemo(() => markdownOutline(body), [body]);
  const isBusy = operation !== null;
  const statusText =
    operation === "ai"
      ? "AI 正在生成文章属性…"
      : operation === "reload"
        ? "正在加载远程版本…"
        : operation === "delete"
          ? "正在删除…"
          : saveState === "remote-saving"
            ? "正在提交到 GitHub…"
            : saveState === "error"
              ? "保存失败"
              : dirty
                ? saveState === "local-saved"
                  ? `未提交 · 本机已暂存${pendingMedia.length ? ` · ${pendingMedia.length} 张图片待上传` : ""}`
                  : "未提交 · 正在暂存…"
                : lastRemoteSaveAt
                  ? `已保存 · ${formatRelative(lastRemoteSaveAt, clock)}`
                  : remote
                    ? "与 GitHub 一致"
                    : "新文章";
  const statusTone =
    saveState === "error"
      ? "error"
      : dirty || saveState === "remote-saving"
        ? "pending"
        : "saved";
  const publicUrl = `${publicBlogUrl}/posts/${frontMatter.slug || "…"}/`;
  const titleError = frontMatter.title.trim() ? "" : "文章标题不能为空。";
  const slugError = validateEditorSlug(
    frontMatter.slug,
    editorContext.occupiedSlugs,
    currentSlug,
  );
  const isPublished = Boolean(remote && !frontMatter.draft);
  const tagSuggestions: ChipSuggestion<string>[] = editorContext.tags.map(
    (item) => ({
      key: item.label,
      label: item.label,
      value: item.label,
      count: item.count,
    }),
  );
  const categorySuggestions: ChipSuggestion<CategoryPath>[] =
    editorContext.categories.map((item) => {
      const path = Array.isArray(item.value) ? item.value : [item.value];
      return {
        key: path.join(" > "),
        label: path.join(" › "),
        value: path,
        count: item.count,
      };
    });

  return (
    <div className={`editor-shell${focusMode ? " focus" : ""}`}>
      <h1 className="sr-only">{initial ? "编辑文章" : "新建文章"}</h1>
      <header className="editor-header">
        <Link
          aria-label="返回文章列表"
          className="icon-button ghost"
          href={returnTo}
          title="返回文章列表"
        >
          <ChevronLeft size={19} />
        </Link>
        <div className="editor-crumb">
          <span className={`badge ${isPublished ? "success" : "warning"}`}>
            {isPublished ? "已发布" : remote ? "草稿" : "新草稿"}
          </span>
          <button
            className="editor-crumb-slug"
            onClick={() => toggleProperties(true)}
            title="在文章属性中修改英文文件名"
            type="button"
          >
            {frontMatter.slug || "未设置文件名"}.md
          </button>
        </div>
        <span
          aria-live="polite"
          className={`save-status ${statusTone}`}
          title={
            lastRemoteSaveAt
              ? `上次提交：${new Date(lastRemoteSaveAt).toLocaleString("zh-CN")}`
              : undefined
          }
        >
          <span className="status-dot" />
          {statusText}
        </span>
        <div className="editor-header-actions">
          <button
            aria-label={focusMode ? "退出专注模式" : "专注模式"}
            aria-pressed={focusMode}
            className="icon-button ghost desktop-only"
            onClick={() => setFocusMode((value) => !value)}
            title={`${focusMode ? "退出专注模式" : "专注模式"}（Ctrl+.）`}
            type="button"
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            aria-label={showProperties ? "收起文章属性" : "展开文章属性"}
            aria-pressed={showProperties}
            className="icon-button ghost"
            onClick={() => toggleProperties()}
            title={`${showProperties ? "收起" : "展开"}文章属性（Ctrl+\\）`}
            type="button"
          >
            {showProperties ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
          {!remote || frontMatter.draft ? (
            <button
              className="button"
              disabled={isBusy}
              onClick={() => save("draft")}
              title="保存为草稿（Ctrl+S）"
              type="button"
            >
              保存草稿
            </button>
          ) : null}
          <button
            className="button primary"
            disabled={isBusy}
            onClick={() => save("post")}
            title={isPublished ? "更新已发布文章（Ctrl+S）" : "发布到博客（Ctrl+Enter）"}
            type="button"
          >
            {isPublished ? "更新" : "发布"}
          </button>
        </div>
      </header>

      <div className="editor-formatbar" role="toolbar" aria-label="Markdown 格式">
        <div className="view-tabs" aria-label="编辑器显示模式" role="group">
          <button
            aria-pressed={editorMode === "live"}
            className={`button${editorMode === "live" ? " active" : ""}`}
            onClick={() => changeEditorMode("live")}
            title="实时预览（Ctrl+Shift+M 切换）"
            type="button"
          >
            <Eye size={14} />
            预览
          </button>
          <button
            aria-pressed={editorMode === "source"}
            className={`button${editorMode === "source" ? " active" : ""}`}
            onClick={() => changeEditorMode("source")}
            title="Markdown 源码（Ctrl+Shift+M 切换）"
            type="button"
          >
            <Code2 size={14} />
            源码
          </button>
        </div>
        <span className="toolbar-divider" />
        {TOOLBAR_ITEMS.map((item, index) =>
          item === "|" ? (
            <span className="toolbar-divider" key={`divider-${index}`} />
          ) : (
            <button
              aria-label={item.label}
              className="format-button"
              key={item.id}
              onClick={() => runToolbarCommand(item.id)}
              onMouseDown={(event) => event.preventDefault()}
              title={item.shortcut ? `${item.label}（${item.shortcut}）` : item.label}
              type="button"
            >
              <item.icon size={16} />
            </button>
          ),
        )}
        <label className="format-button" title="上传图片；也可以直接粘贴或拖入正文">
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
            ref={imageInputRef}
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
              ref={mediaTriggerRef}
              title="从媒体库选择已有图片"
              type="button"
            >
              <Images size={16} />
            </button>
          }
        />
      </div>

      <div className="editor-workspace">
        <div
          aria-label="正文编辑区"
          className="editor-pane"
          ref={editorPaneRef}
          role="region"
        >
          <div className="editor-paper">
            <textarea
              aria-invalid={attemptedSave && Boolean(titleError)}
              aria-label="文章标题"
              autoFocus={!initial}
              className="editor-title-field"
              onChange={(event) => changeTitle(event.target.value.replace(/\n/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  const view = editorView.current;
                  if (view) {
                    view.dispatch({ selection: { anchor: 0 } });
                    view.focus();
                  }
                }
              }}
              placeholder="无标题"
              ref={titleRef}
              rows={1}
              value={frontMatter.title}
            />
            {attemptedSave && titleError ? (
              <p className="editor-title-error" role="alert">
                {titleError}
              </p>
            ) : null}
            <CodeMirror
              basicSetup={{
                bracketMatching: true,
                closeBrackets: true,
                foldGutter: editorMode === "source",
                highlightActiveLine: editorMode === "source",
                highlightSelectionMatches: true,
                history: true,
                lineNumbers: editorMode === "source",
              }}
              extensions={editorExtensions}
              onChange={changeBody}
              onCreateEditor={(view) => {
                editorView.current = view;
                view.contentDOM.setAttribute(
                  "aria-label",
                  "Markdown 正文编辑器",
                );
              }}
              placeholder={"开始写作…  输入 / 插入标题、列表、图片等"}
              value={body}
            />
          </div>
          {slashMenu ? (
            <div
              aria-label="Markdown 快捷命令"
              className="slash-menu"
              role="listbox"
              style={{ left: slashMenu.left, top: slashMenu.top }}
            >
              {slashMenu.commands.map((command, index) => (
                <button
                  aria-selected={index === slashMenu.index}
                  className={index === slashMenu.index ? "active" : undefined}
                  key={command.label}
                  onClick={() => {
                    if (editorView.current) {
                      applySlashCommand(editorView.current, command);
                    }
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (editorView.current && index !== slashMenu.index) {
                      selectSlashIndex(editorView.current, index);
                    }
                  }}
                  role="option"
                  type="button"
                >
                  <strong>{command.label}</strong>
                  <span>{command.detail}</span>
                </button>
              ))}
              <div className="slash-hint">↑↓ 选择 · Enter 插入 · Esc 关闭</div>
            </div>
          ) : null}
        </div>

        {showProperties ? (
          <>
            <button
              aria-label="关闭文章属性"
              className="property-backdrop"
              onClick={() => toggleProperties(false)}
              type="button"
            />
            <aside className="property-panel" aria-label="文章属性">
              <div className="property-section">
                <div className="property-heading">发布设置</div>
                <label className="field">
                  <span className="field-label">英文文件名</span>
                  <input
                    aria-invalid={Boolean(slugError) && (slugEdited || attemptedSave)}
                    className="input mono"
                    onChange={(event) => changeSlug(event.target.value)}
                    placeholder="english-file-name"
                    spellCheck={false}
                    value={frontMatter.slug}
                  />
                </label>
                {slugError && (slugEdited || attemptedSave) ? (
                  <p className="field-error" role="alert">
                    {slugError}
                  </p>
                ) : (
                  <p className="field-help url-preview" title={publicUrl}>
                    {publicUrl}
                  </p>
                )}
                {currentSlug && currentSlug !== frontMatter.slug ? (
                  <p className="field-warning">
                    保存后公开 URL 和文章资源目录会一起改名。
                  </p>
                ) : null}
                <div className="button-row">
                  <button
                    className="preset-button"
                    disabled={isBusy || !frontMatter.title.trim()}
                    onClick={() => void suggestMetadata()}
                    title="根据中文标题、当前正文和历史已发布文章生成文件名、标签和分类"
                    type="button"
                  >
                    <WandSparkles size={13} />
                    {operation === "ai" ? "正在生成…" : "AI 生成文件名和标签"}
                  </button>
                  <button
                    className="preset-button subtle"
                    onClick={regenerateSlug}
                    title="不调用模型，仅按标题中的英文字母生成文件名"
                    type="button"
                  >
                    按标题生成
                  </button>
                </div>
                <label className="field">
                  <span className="field-label">首次上线时间</span>
                  <input
                    className="input"
                    onChange={(event) => changeFirstPublishedAt(event.target.value)}
                    pattern="\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"
                    placeholder="首次发布时自动写入"
                    value={frontMatter.firstPublishedAt}
                  />
                  <span className="field-help">格式 YYYY-MM-DD HH:mm:ss，留空则发布时自动填写。</span>
                </label>
              </div>

              <div className="property-section">
                <ChipInput
                  label="标签"
                  onChange={(tags) => updateFrontMatter("tags", tags)}
                  parse={(text) => text.trim() || null}
                  placeholder="输入后按 Enter 或逗号"
                  suggestions={tagSuggestions}
                  toKey={(tag) => tag}
                  toLabel={(tag) => tag}
                  values={frontMatter.tags}
                />
                <ChipInput
                  hint="多级分类用 > 分隔，例如：教程 > 分享"
                  label="分类"
                  onChange={(categories) => updateFrontMatter("categories", categories)}
                  parse={(text) => {
                    const path = text
                      .split(/\s*[>＞›/]\s*/)
                      .map((part) => part.trim())
                      .filter(Boolean);
                    return path.length ? path : null;
                  }}
                  placeholder="输入后按 Enter"
                  quickPickCount={6}
                  suggestions={categorySuggestions}
                  toKey={(path) => path.join(" > ")}
                  toLabel={(path) => path.join(" › ")}
                  values={frontMatter.categories}
                />
              </div>

              {editorContext.presets.length ? (
                <div className="property-section">
                  <div className="property-heading">快捷模板</div>
                  <div className="preset-list">
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
                  </div>
                </div>
              ) : null}

              {pendingMedia.length ? (
                <div className="property-section">
                  <div className="property-heading">待上传图片说明</div>
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

              <details className="property-section property-details">
                <summary className="property-heading">摘要、封面与高级设置</summary>
                <label className="field">
                  <span className="field-label">摘要</span>
                  <textarea className="textarea" onChange={(event) => updateFrontMatter("excerpt", event.target.value)} placeholder="留空时由主题自动截取" value={frontMatter.excerpt} />
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
              </details>

              {remote ? (
                <div className="property-section">
                  {isPublished ? (
                    <a className="button" href={publicUrl} rel="noreferrer" target="_blank">
                      <Eye size={15} />
                      查看公开页面
                    </a>
                  ) : null}
                  {isPublished ? (
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
                  <button
                    className="button danger"
                    disabled={isBusy}
                    onClick={deleteArticle}
                    type="button"
                  >
                    <Trash2 size={15} />
                    删除文章
                  </button>
                </div>
              ) : null}
            </aside>
          </>
        ) : null}
      </div>

      <footer className="editor-statusbar">
        <span>
          {stats.count} 字 · 约 {stats.minutes} 分钟
          {selectionLength ? ` · 已选 ${selectionLength} 字符` : ""}
        </span>
        <span className="editor-shortcuts">
          / 插入 · Ctrl+S 保存 · Ctrl+Enter 发布 · Ctrl+. 专注
        </span>
      </footer>

      <Toast message={message} onDismiss={() => setMessage("")} />

      {recoveryOffer ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <section className="panel dialog-card recovery-dialog">
            <div className="panel-header">
              <h2 className="panel-title" id="recovery-title">发现本机未提交的版本</h2>
            </div>
            <div className="panel-body">
              <p style={{ marginTop: 0 }}>
                {formatRelative(recoveryOffer.savedAt, clock)}（
                {new Date(recoveryOffer.savedAt).toLocaleString("zh-CN")}）在这台设备上自动暂存过这篇文章，
                内容和 GitHub 上的版本不同。
              </p>
              <dl className="recovery-summary">
                <div>
                  <dt>标题</dt>
                  <dd>{recoveryOffer.frontMatter.title || "未命名"}</dd>
                </div>
                <div>
                  <dt>正文</dt>
                  <dd>
                    {readingStats(recoveryOffer.body).count} 字（当前 {stats.count} 字）
                  </dd>
                </div>
                {recoveryOffer.pendingMedia?.length ? (
                  <div>
                    <dt>图片</dt>
                    <dd>{recoveryOffer.pendingMedia.length} 张尚未上传</dd>
                  </div>
                ) : null}
              </dl>
              <div className="button-group dialog-actions">
                <button className="button danger" onClick={discardRecovery} type="button">
                  丢弃本机版本
                </button>
                <button className="button primary" onClick={acceptRecovery} type="button">
                  恢复本机版本
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

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
