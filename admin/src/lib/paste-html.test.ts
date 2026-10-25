import { describe, expect, it } from "vitest";
import { pastedHtmlToMarkdown, shouldConvertPastedHtml } from "@/lib/paste-html";

describe("shouldConvertPastedHtml", () => {
  it("converts structured documents", () => {
    expect(shouldConvertPastedHtml("<h2>标题</h2><p>段落</p>", ["text/html", "text/plain"])).toBe(true);
  });

  it("keeps code editor pastes as plain text", () => {
    const html = '<div><span style="color:#c586c0">const</span> a = 1;</div>';
    expect(shouldConvertPastedHtml(html, ["text/html", "vscode-editor-data"])).toBe(false);
    expect(shouldConvertPastedHtml(html, ["text/html"])).toBe(false);
  });
});

describe("pastedHtmlToMarkdown", () => {
  it("turns headings, emphasis, links and lists into Markdown", () => {
    const markdown = pastedHtmlToMarkdown(
      '<h2>读书笔记</h2><p>这是<strong>重点</strong>，见<a href="https://example.com">链接</a>。</p><ul><li>一</li><li>二</li></ul>',
    );
    expect(markdown).toBe(
      "## 读书笔记\n\n这是**重点**，见[链接](https://example.com)。\n\n- 一\n- 二",
    );
  });

  it("keeps tables and drops inline base64 images", () => {
    const markdown = pastedHtmlToMarkdown(
      '<table><thead><tr><th>列</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table><p><img src="data:image/png;base64,AAAA" alt="x">文字</p>',
    );
    expect(markdown).toContain("| 列 |");
    expect(markdown).toContain("| 值 |");
    expect(markdown).not.toContain("data:image");
    expect(markdown).toContain("文字");
  });

  it("only uses the copied fragment from Windows clipboard HTML", () => {
    const markdown = pastedHtmlToMarkdown(
      "<html><body><p>外面</p><!--StartFragment--><p>里面</p><!--EndFragment--></body></html>",
    );
    expect(markdown).toBe("里面");
  });
});
