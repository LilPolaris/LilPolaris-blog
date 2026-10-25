import {
  EditorSelection,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";

/**
 * Wraps the selection in an inline marker such as `**`, or removes the marker
 * when the selection is already wrapped. With nothing selected a placeholder
 * is inserted and selected so typing replaces it.
 */
export function toggleInlineMarker(
  state: EditorState,
  marker: string,
  placeholder = "文本",
): TransactionSpec {
  return state.changeByRange((range) => {
    const size = marker.length;
    const before = state.sliceDoc(range.from - size, range.from);
    const after = state.sliceDoc(range.to, range.to + size);
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: range.from - size, to: range.from },
          { from: range.to, to: range.to + size },
        ],
        range: EditorSelection.range(range.from - size, range.to - size),
      };
    }
    const selected = state.sliceDoc(range.from, range.to);
    if (
      selected.length >= size * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker)
    ) {
      const inner = selected.slice(size, selected.length - size);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }
    const text = selected || placeholder;
    return {
      changes: {
        from: range.from,
        to: range.to,
        insert: `${marker}${text}${marker}`,
      },
      range: EditorSelection.range(
        range.from + size,
        range.from + size + text.length,
      ),
    };
  });
}

const HEADING_PREFIX = /^#{1,6}\s+/;
const LIST_PREFIX = /^(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;

function selectedLines(state: EditorState) {
  const lines = new Map<number, { from: number; text: string }>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) {
      const line = state.doc.line(number);
      lines.set(line.from, { from: line.from, text: line.text });
    }
  }
  return [...lines.values()].sort((a, b) => a.from - b.from);
}

/**
 * Applies a block prefix (`## `, `> `, `- `, `1. `, `- [ ] `) to every
 * selected line. When every line already carries it the prefix is removed;
 * headings and list styles replace one another instead of stacking.
 */
export function toggleLinePrefix(
  state: EditorState,
  prefix: string,
): TransactionSpec {
  const lines = selectedLines(state);
  const ordered = /^\d+\.\s$/.test(prefix);
  const isHeading = HEADING_PREFIX.test(prefix);
  const isList = LIST_PREFIX.test(prefix);
  const has = (text: string) =>
    ordered ? /^\d+[.)]\s+/.test(text) : text.startsWith(prefix);
  const allHave = lines.every((line) => has(line.text));
  const changes = lines.map((line, index) => {
    if (allHave) {
      const existing = ordered
        ? line.text.match(/^\d+[.)]\s+/)![0]
        : prefix;
      return { from: line.from, to: line.from + existing.length, insert: "" };
    }
    const replaced = isHeading
      ? line.text.match(HEADING_PREFIX)?.[0]
      : isList
        ? line.text.match(LIST_PREFIX)?.[0]
        : undefined;
    const insert = ordered ? `${index + 1}. ` : prefix;
    return {
      from: line.from,
      to: line.from + (replaced?.length || 0),
      insert,
    };
  });
  return { changes, scrollIntoView: true };
}

/** Turns the selection into `[text](url)` and selects the URL for editing. */
export function insertLink(
  state: EditorState,
  url = "https://",
): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || "链接文字";
    const insert = `[${text}](${url})`;
    const urlFrom = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlFrom, urlFrom + url.length),
    };
  });
}

/**
 * Inserts a block of Markdown on its own paragraph, adding blank lines only
 * where the surrounding text needs them.
 */
export function insertBlock(
  state: EditorState,
  block: string,
  cursorOffset = block.length,
): TransactionSpec {
  const range = state.selection.main;
  const before = state.sliceDoc(Math.max(0, range.from - 2), range.from);
  const after = state.sliceDoc(range.to, range.to + 2);
  const lead =
    range.from === 0 || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const trail = after.startsWith("\n\n") || range.to === state.doc.length
    ? "\n"
    : after.startsWith("\n")
      ? "\n"
      : "\n\n";
  const insert = `${lead}${block}${trail}`;
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + lead.length + cursorOffset },
    scrollIntoView: true,
  };
}
