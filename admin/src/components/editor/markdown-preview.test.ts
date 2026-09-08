// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./markdown-preview";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));
afterEach(() => {
  cleanup();
  mermaid.render.mockReset();
});

describe("Markdown preview", () => {
  it("builds matching unique anchors from parsed headings, excluding fenced code", () => {
    const markdown =
      "# **重复**\n\n```md\n# 假标题\n```\n\n## 重复\n\n## 重复-1\n\n末节\n---\n";
    const { container } = render(createElement(MarkdownPreview, { markdown }));
    const headings = [...container.querySelectorAll("h1,h2,h3")];
    const links = [...container.querySelectorAll("details a")];
    expect(headings.map((h) => h.textContent)).toEqual([
      "重复",
      "重复",
      "重复-1",
      "末节",
    ]);
    expect(new Set(headings.map((h) => h.id)).size).toBe(4);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      headings.map((h) => `#${h.id}`),
    );
  });

  it("recovers a diagram after correcting syntax and preserves it on unrelated edits", async () => {
    mermaid.render.mockRejectedValueOnce(new Error("syntax"));
    const { rerender, container } = render(
      createElement(MarkdownPreview, { markdown: "```mermaid\nbad\n```" }),
    );
    await screen.findByRole("status");
    mermaid.render.mockResolvedValue({
      svg: '<svg aria-label="valid diagram"></svg>',
    });
    rerender(
      createElement(MarkdownPreview, {
        markdown: "```mermaid\ngraph LR; A-->B\n```",
      }),
    );
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
    const calls = mermaid.render.mock.calls.length;
    rerender(
      createElement(MarkdownPreview, {
        markdown: "```mermaid\ngraph LR; A-->B\n```\n\n正文修改",
      }),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(mermaid.render).toHaveBeenCalledTimes(calls);
  });

  it("ignores an obsolete diagram response", async () => {
    let finishOld!: (value: { svg: string }) => void;
    mermaid.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { rerender, container } = render(
      createElement(MarkdownPreview, { markdown: "```mermaid\nold\n```" }),
    );
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    mermaid.render.mockResolvedValue({ svg: '<svg aria-label="new"></svg>' });
    rerender(
      createElement(MarkdownPreview, { markdown: "```mermaid\nnew\n```" }),
    );
    await waitFor(() =>
      expect(container.querySelector('[aria-label="new"]')).not.toBeNull(),
    );
    await act(async () => finishOld({ svg: '<svg aria-label="old"></svg>' }));
    expect(container.querySelector('[aria-label="old"]')).toBeNull();
    expect(container.querySelector('[aria-label="new"]')).not.toBeNull();
  });
});
