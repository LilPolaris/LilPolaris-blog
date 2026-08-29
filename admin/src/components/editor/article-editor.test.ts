import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync(
  fileURLToPath(new URL("./article-editor.tsx", import.meta.url)),
  "utf8",
);

describe("ArticleEditor save wiring", () => {
  it("routes Ctrl/Cmd+S through the current publication state", () => {
    expect(editorSource).toContain(
      "void save(kindForRegularSave(frontMatter.draft));",
    );
    expect(editorSource).not.toMatch(
      /key\.toLowerCase\(\) === "s"[\s\S]{0,160}void save\("draft"\)/,
    );
  });

  it("keeps unpublishing behind its own confirmation", () => {
    expect(editorSource).toContain("function moveToDraft()");
    expect(editorSource).toContain("取消发布并移入草稿");
    expect(editorSource).toContain("文章将从公开站点下线并移入草稿");
  });
});
