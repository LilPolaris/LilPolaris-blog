import {
  type EditorState,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { insertBlock } from "@/lib/markdown-commands";

export interface SlashCommand {
  label: string;
  detail: string;
  keywords: string;
  insert?: string;
  /** Cursor position inside `insert`; defaults to the end. */
  cursor?: number;
  action?: "image" | "media";
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { label: "一级标题", detail: "# 标题", keywords: "h1 heading biaoti", insert: "# " },
  { label: "二级标题", detail: "## 标题", keywords: "h2 heading biaoti", insert: "## " },
  { label: "三级标题", detail: "### 标题", keywords: "h3 heading biaoti", insert: "### " },
  { label: "无序列表", detail: "- 列表项", keywords: "ul list liebiao", insert: "- " },
  { label: "有序列表", detail: "1. 列表项", keywords: "ol list liebiao", insert: "1. " },
  { label: "待办事项", detail: "- [ ] 待办", keywords: "todo task daiban", insert: "- [ ] " },
  { label: "引用", detail: "> 引用内容", keywords: "quote yinyong", insert: "> " },
  {
    label: "代码块",
    detail: "带语言的代码块",
    keywords: "code daima",
    insert: "```text\n\n```",
    cursor: 8,
  },
  {
    label: "表格",
    detail: "两列表格",
    keywords: "table biaoge",
    insert: "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |",
    cursor: 2,
  },
  { label: "分割线", detail: "---", keywords: "hr divider fenge", insert: "---" },
  { label: "上传图片", detail: "选择本地图片", keywords: "image img tupian upload", action: "image" },
  { label: "媒体库图片", detail: "插入已有图片", keywords: "media image meiti", action: "media" },
  {
    label: "Mermaid",
    detail: "流程图",
    keywords: "mermaid chart liucheng",
    insert: "```mermaid\ngraph LR\n  A --> B\n```",
  },
  { label: "公式", detail: "KaTeX 块公式", keywords: "math latex gongshi", insert: "$$\n\n$$", cursor: 3 },
];

/** DOM event fired on the editor when a command needs the surrounding UI. */
export const SLASH_ACTION_EVENT = "editor-slash-action";

const SLASH_PATTERN = /(?:^|\s)\/([^\s/]*)$/;

interface SlashState {
  index: number;
  dismissedAt: number | null;
}

const setSlashIndex = StateEffect.define<number>();
const dismissSlash = StateEffect.define<number>();

const slashField = StateField.define<SlashState>({
  create: () => ({ index: 0, dismissedAt: null }),
  update(value, transaction) {
    let next = value;
    if (transaction.docChanged) next = { index: 0, dismissedAt: null };
    for (const effect of transaction.effects) {
      if (effect.is(setSlashIndex)) next = { ...next, index: effect.value };
      if (effect.is(dismissSlash)) next = { ...next, dismissedAt: effect.value };
    }
    return next;
  },
});

function slashMatch(state: EditorState) {
  const selection = state.selection.main;
  if (!selection.empty) return null;
  const line = state.doc.lineAt(selection.head);
  const before = state.sliceDoc(line.from, selection.head);
  const match = before.match(SLASH_PATTERN);
  if (!match || match.index === undefined) return null;
  const slashOffset = match[0].lastIndexOf("/");
  return {
    query: match[1].toLowerCase(),
    from: line.from + match.index + slashOffset,
    head: selection.head,
    lineStart: line.from,
  };
}

export function filterSlashCommands(query: string) {
  return SLASH_COMMANDS.filter((command) =>
    `${command.label} ${command.detail} ${command.keywords}`
      .toLowerCase()
      .includes(query),
  );
}

/** What the menu should show for the current editor state, if anything. */
export function slashMenuState(state: EditorState) {
  const match = slashMatch(state);
  if (!match) return null;
  const field = state.field(slashField, false);
  if (field?.dismissedAt === match.from) return null;
  const commands = filterSlashCommands(match.query);
  if (!commands.length) return null;
  return {
    commands,
    index: Math.min(field?.index || 0, commands.length - 1),
    anchor: match.head,
  };
}

export function applySlashCommand(view: EditorView, command: SlashCommand) {
  const match = slashMatch(view.state);
  if (!match) return;
  const { from, head, lineStart } = match;
  view.dispatch({ changes: { from, to: head, insert: "" } });
  if (command.action) {
    view.dom.dispatchEvent(
      new CustomEvent(SLASH_ACTION_EVENT, {
        bubbles: true,
        detail: command.action,
      }),
    );
    return;
  }
  const insert = command.insert || "";
  const onlyCommandOnLine = view.state.sliceDoc(lineStart, from).trim() === "";
  const isLinePrefix = insert.endsWith(" ") && !insert.includes("\n");
  if (isLinePrefix && onlyCommandOnLine) {
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + (command.cursor ?? insert.length) },
      scrollIntoView: true,
    });
  } else {
    view.dispatch(insertBlock(view.state, insert, command.cursor));
  }
  view.focus();
}

function moveSelection(view: EditorView, step: number) {
  const menu = slashMenuState(view.state);
  if (!menu) return false;
  const next = (menu.index + step + menu.commands.length) % menu.commands.length;
  view.dispatch({ effects: setSlashIndex.of(next) });
  return true;
}

function acceptSelection(view: EditorView) {
  const menu = slashMenuState(view.state);
  if (!menu) return false;
  applySlashCommand(view, menu.commands[menu.index]);
  return true;
}

export function selectSlashIndex(view: EditorView, index: number) {
  view.dispatch({ effects: setSlashIndex.of(index) });
}

/** Slash-menu state and keyboard handling for the article editor. */
export function slashCommandExtension() {
  return [
    slashField,
    Prec.highest(
      keymap.of([
        { key: "ArrowDown", run: (view) => moveSelection(view, 1) },
        { key: "ArrowUp", run: (view) => moveSelection(view, -1) },
        { key: "Enter", run: acceptSelection },
        { key: "Tab", run: acceptSelection },
        {
          key: "Escape",
          run: (view) => {
            const match = slashMatch(view.state);
            if (!match || !slashMenuState(view.state)) return false;
            view.dispatch({ effects: dismissSlash.of(match.from) });
            return true;
          },
        },
      ]),
    ),
  ];
}
