import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  insertBlock,
  insertLink,
  toggleInlineMarker,
  toggleLinePrefix,
} from "@/lib/markdown-commands";

function stateOf(doc: string, from: number, to = from) {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: EditorState.allowMultipleSelections.of(true),
  });
}

function apply(state: EditorState, spec: ReturnType<typeof toggleInlineMarker>) {
  return state.update(spec).state;
}

describe("toggleInlineMarker", () => {
  it("wraps the selection and keeps the text selected", () => {
    const next = apply(stateOf("写作很好", 2, 4), toggleInlineMarker(stateOf("写作很好", 2, 4), "**"));
    expect(next.doc.toString()).toBe("写作**很好**");
    const { from, to } = next.selection.main;
    expect(next.sliceDoc(from, to)).toBe("很好");
  });

  it("unwraps text that is already wrapped", () => {
    const state = stateOf("写作**很好**", 4, 6);
    const next = apply(state, toggleInlineMarker(state, "**"));
    expect(next.doc.toString()).toBe("写作很好");
  });

  it("unwraps when the markers are part of the selection", () => {
    const state = stateOf("a *b* c", 2, 5);
    const next = apply(state, toggleInlineMarker(state, "*"));
    expect(next.doc.toString()).toBe("a b c");
  });

  it("inserts a selected placeholder without a selection", () => {
    const state = stateOf("", 0);
    const next = apply(state, toggleInlineMarker(state, "`", "代码"));
    expect(next.doc.toString()).toBe("`代码`");
    const { from, to } = next.selection.main;
    expect(next.sliceDoc(from, to)).toBe("代码");
  });
});

describe("toggleLinePrefix", () => {
  it("prefixes every selected line and removes it again", () => {
    const doc = "第一行\n第二行";
    const state = stateOf(doc, 0, doc.length);
    const quoted = apply(state, toggleLinePrefix(state, "> "));
    expect(quoted.doc.toString()).toBe("> 第一行\n> 第二行");
    const restored = apply(
      quoted.update({ selection: { anchor: 0, head: quoted.doc.length } }).state,
      toggleLinePrefix(
        quoted.update({ selection: { anchor: 0, head: quoted.doc.length } }).state,
        "> ",
      ),
    );
    expect(restored.doc.toString()).toBe(doc);
  });

  it("replaces an existing heading level instead of stacking", () => {
    const state = stateOf("### 标题", 3);
    const next = apply(state, toggleLinePrefix(state, "## "));
    expect(next.doc.toString()).toBe("## 标题");
  });

  it("numbers ordered lists and switches list styles", () => {
    const doc = "- 苹果\n- 香蕉";
    const state = stateOf(doc, 0, doc.length);
    const next = apply(state, toggleLinePrefix(state, "1. "));
    expect(next.doc.toString()).toBe("1. 苹果\n2. 香蕉");
  });
});

describe("insertLink", () => {
  it("wraps the selection and selects the URL placeholder", () => {
    const state = stateOf("看这里", 0, 3);
    const next = apply(state, insertLink(state));
    expect(next.doc.toString()).toBe("[看这里](https://)");
    const { from, to } = next.selection.main;
    expect(next.sliceDoc(from, to)).toBe("https://");
  });
});

describe("insertBlock", () => {
  it("separates a block from the surrounding paragraph", () => {
    const state = stateOf("段落", 2);
    const next = state.update(insertBlock(state, "---")).state;
    expect(next.doc.toString()).toBe("段落\n\n---\n");
  });

  it("does not add blank lines at the start of an empty document", () => {
    const state = stateOf("", 0);
    const next = state.update(insertBlock(state, "---")).state;
    expect(next.doc.toString()).toBe("---\n");
  });
});
