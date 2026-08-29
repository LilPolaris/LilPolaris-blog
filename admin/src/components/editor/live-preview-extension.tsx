"use client";

import {
  Range,
  StateField,
  type EditorState,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownPreview } from "@/components/editor/markdown-preview";

const mountedRoots = new WeakMap<HTMLElement, Root>();

function selectionTouches(
  state: EditorState,
  from: number,
  to: number,
) {
  return state.selection.ranges.some(
    (range) => range.head >= from && range.head <= to,
  );
}

class PreviewWidget extends WidgetType {
  constructor(
    private readonly markdown: string,
    private readonly from: number,
    private readonly to: number,
    private readonly postPath?: string,
    private readonly assetUrls: Record<string, string> = {},
  ) {
    super();
  }

  eq(other: PreviewWidget) {
    return (
      other.markdown === this.markdown &&
      other.from === this.from &&
      other.to === this.to &&
      other.postPath === this.postPath &&
      JSON.stringify(other.assetUrls) === JSON.stringify(this.assetUrls)
    );
  }

  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "cm-live-block-preview";
    element.title = "点击展开 Markdown 源码";
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        selection: { anchor: this.from, head: this.to },
        scrollIntoView: true,
      });
      view.focus();
    });
    const root = createRoot(element);
    mountedRoots.set(element, root);
    root.render(
      <MarkdownPreview
        assetUrls={this.assetUrls}
        hideOutline
        markdown={this.markdown}
        postPath={this.postPath}
      />,
    );
    return element;
  }

  destroy(dom: HTMLElement) {
    const root = mountedRoots.get(dom);
    if (root) {
      queueMicrotask(() => root.unmount());
      mountedRoots.delete(dom);
    }
  }

  ignoreEvent() {
    return false;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly position: number,
  ) {
    super();
  }

  eq(other: TaskWidget) {
    return (
      other.checked === this.checked && other.position === this.position
    );
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-live-task-checkbox";
    input.title = this.checked ? "标记为未完成" : "标记为已完成";
    input.addEventListener("mousedown", (event) => event.preventDefault());
    input.addEventListener("click", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: {
          from: this.position,
          to: this.position + 1,
          insert: this.checked ? " " : "x",
        },
      });
      view.focus();
    });
    return input;
  }

  ignoreEvent() {
    return false;
  }
}

function addInlineDecorations(
  lineText: string,
  lineFrom: number,
  ranges: Range<Decoration>[],
) {
  const occupied: Array<[number, number]> = [];
  const overlaps = (from: number, to: number) =>
    occupied.some(([left, right]) => from < right && to > left);
  const syntax = (
    expression: RegExp,
    contentGroup: number,
    className: string,
  ) => {
    for (const match of lineText.matchAll(expression)) {
      if (match.index === undefined) continue;
      const fullFrom = match.index;
      const fullTo = fullFrom + match[0].length;
      if (overlaps(fullFrom, fullTo)) continue;
      const content = match[contentGroup];
      const contentOffset = match[0].indexOf(content);
      const contentFrom = fullFrom + contentOffset;
      const contentTo = contentFrom + content.length;
      occupied.push([fullFrom, fullTo]);
      if (contentFrom > fullFrom) {
        ranges.push(
          Decoration.replace({}).range(
            lineFrom + fullFrom,
            lineFrom + contentFrom,
          ),
        );
      }
      ranges.push(
        Decoration.mark({ class: className }).range(
          lineFrom + contentFrom,
          lineFrom + contentTo,
        ),
      );
      if (contentTo < fullTo) {
        ranges.push(
          Decoration.replace({}).range(
            lineFrom + contentTo,
            lineFrom + fullTo,
          ),
        );
      }
    }
  };

  syntax(/`([^`\n]+)`/g, 1, "cm-live-inline-code");
  syntax(/\*\*([^*\n]+)\*\*/g, 1, "cm-live-strong");
  syntax(/__([^_\n]+)__/g, 1, "cm-live-strong");
  syntax(/~~([^~\n]+)~~/g, 1, "cm-live-strike");
  syntax(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, 1, "cm-live-em");
  syntax(/(?<!_)_([^_\n]+)_(?!_)/g, 1, "cm-live-em");

  for (const match of lineText.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
    if (match.index === undefined) continue;
    const fullFrom = match.index;
    const fullTo = fullFrom + match[0].length;
    if (overlaps(fullFrom, fullTo)) continue;
    const labelFrom = fullFrom + 1;
    const labelTo = labelFrom + match[1].length;
    ranges.push(
      Decoration.replace({}).range(lineFrom + fullFrom, lineFrom + labelFrom),
      Decoration.mark({
        class: "cm-live-link",
        attributes: { title: match[2] },
      }).range(lineFrom + labelFrom, lineFrom + labelTo),
      Decoration.replace({}).range(lineFrom + labelTo, lineFrom + fullTo),
    );
  }
}

function blockRanges(state: EditorState) {
  const source = state.doc.toString();
  const blocks: Array<{ from: number; to: number; source: string }> = [];
  const patterns = [
    /```[\w-]*\s*\n[\s\S]*?\n```/g,
    /\$\$\s*\n[\s\S]*?\n\$\$/g,
    /(?:^|\n)(\|[^\n]+\|\r?\n\|(?:\s*:?-+:?\s*\|)+\r?\n(?:\|[^\n]+\|\r?\n?)+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const captured = match[1] || match[0];
      const offset = match[0].indexOf(captured);
      blocks.push({
        from: match.index + offset,
        to: match.index + offset + captured.length,
        source: captured,
      });
    }
  }
  return blocks.sort((left, right) => left.from - right.from);
}

export function buildLivePreviewDecorations(
  state: EditorState,
  postPath?: string,
  assetUrls: Record<string, string> = {},
) {
  const ranges: Range<Decoration>[] = [];
  const covered = new Set<number>();
  for (const block of blockRanges(state)) {
    if (selectionTouches(state, block.from, block.to)) continue;
    const startLine = state.doc.lineAt(block.from).number;
    const endLine = state.doc.lineAt(Math.max(block.from, block.to - 1)).number;
    for (let number = startLine; number <= endLine; number += 1) {
      covered.add(number);
    }
    ranges.push(
      Decoration.replace({
        block: true,
        widget: new PreviewWidget(
          block.source,
          block.from,
          block.to,
          postPath,
          assetUrls,
        ),
      }).range(block.from, block.to),
    );
  }

  for (let number = 1; number <= state.doc.lines; number += 1) {
    if (covered.has(number)) continue;
    const line = state.doc.line(number);
    const active = selectionTouches(state, line.from, line.to);
    const image =
      line.text.match(
        /^\s*(\{%\s*asset_img\s+(?:"[^"]+"|'[^']+'|\S+)(?:\s+.*?)?\s*%\})\s*$/,
      ) || line.text.match(/^\s*(!\[[^\]]*\]\([^)]+\))\s*$/);
    if (image && !active) {
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new PreviewWidget(
            image[1],
            line.from,
            line.to,
            postPath,
            assetUrls,
          ),
        }).range(line.from, line.to),
      );
      continue;
    }

    const heading = line.text.match(/^(#{1,6})(\s+)/);
    if (heading) {
      ranges.push(
        Decoration.line({
          attributes: { class: `cm-live-heading cm-live-h${heading[1].length}` },
        }).range(line.from),
      );
      if (!active) {
        ranges.push(
          Decoration.replace({}).range(
            line.from,
            line.from + heading[0].length,
          ),
        );
      }
    }
    const quote = line.text.match(/^(\s*>\s?)/);
    if (quote) {
      ranges.push(
        Decoration.line({
          attributes: { class: "cm-live-quote" },
        }).range(line.from),
      );
      if (!active) {
        ranges.push(
          Decoration.replace({}).range(
            line.from,
            line.from + quote[0].length,
          ),
        );
      }
    }
    const list = line.text.match(/^(\s*)([-+*]|\d+\.)(\s+)/);
    if (list) {
      ranges.push(
        Decoration.line({
          attributes: { class: "cm-live-list" },
        }).range(line.from),
      );
      if (!active) {
        ranges.push(
          Decoration.replace({}).range(
            line.from + list[1].length,
            line.from + list[0].length,
          ),
        );
      }
    }
    const task = line.text.match(/^(\s*[-+*]\s+)\[([ xX])\](\s+)/);
    if (task) {
      ranges.push(
        Decoration.line({
          attributes: { class: "cm-live-task" },
        }).range(line.from),
      );
      if (!active) {
        const markerFrom = line.from + task[1].length;
        ranges.push(
          Decoration.replace({
            widget: new TaskWidget(
              task[2].toLowerCase() === "x",
              markerFrom + 1,
            ),
          }).range(markerFrom, markerFrom + task[0].slice(task[1].length).length),
        );
      }
    }
    const fence = line.text.match(/^\s*```/);
    if (fence) {
      ranges.push(
        Decoration.line({
          attributes: { class: "cm-live-code-fence" },
        }).range(line.from),
      );
    }
    if (!active) addInlineDecorations(line.text, line.from, ranges);
  }
  return Decoration.set(
    ranges.sort((left, right) => left.from - right.from || left.to - right.to),
    true,
  );
}

export function livePreviewExtension(options: {
  postPath?: string;
  assetUrls?: Record<string, string>;
}) {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDecorations(
        state,
        options.postPath,
        options.assetUrls,
      );
    },
    update(decorations, transaction) {
      if (!transaction.docChanged && !transaction.selection) return decorations;
      return buildLivePreviewDecorations(
        transaction.state,
        options.postPath,
        options.assetUrls,
      );
    },
    provide: (value) => EditorView.decorations.from(value),
  });
  return [field, EditorView.atomicRanges.of((view) => view.state.field(field))];
}
