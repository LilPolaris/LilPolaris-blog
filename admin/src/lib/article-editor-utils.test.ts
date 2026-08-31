import { describe, expect, it } from "vitest";
import {
  articleContentForAi,
  kindForRegularSave,
  migrateRecoveredFrontMatter,
  replaceUploadedMediaNames,
  slugFromTitle,
  validateEditorSlug,
} from "@/lib/article-editor-utils";

describe("article editor helpers", () => {
  it("keeps the current publication state for a regular save", () => {
    expect(kindForRegularSave(false)).toBe("post");
    expect(kindForRegularSave(true)).toBe("draft");
  });

  it("derives an editable safe slug and reports field errors", () => {
    expect(slugFromTitle("Hello, Café!", "post-1")).toBe("hello-cafe");
    expect(slugFromTitle("中文标题", "post-1")).toBe("post-1");
    expect(validateEditorSlug("bad slug", [])).toContain("只能使用");
    expect(validateEditorSlug("used", ["used"])).toContain("已被");
    expect(validateEditorSlug("used", ["used"], "used")).toBe("");
  });

  it("reconciles uploaded media names without discarding later edits", () => {
    const latest =
      '{% asset_img "pending.png" "说明" %}\n{% asset_img \'second.png\' \'说明\' %}\n\n保存期间继续写的内容';
    expect(
      replaceUploadedMediaNames(
        latest,
        [
          { id: "one", name: "pending.png" },
          { id: "two", name: "second.png" },
        ],
        { one: "pending-2.png", two: "second-2.png" },
      ),
    ).toBe(
      '{% asset_img "pending-2.png" "说明" %}\n{% asset_img \'second-2.png\' \'说明\' %}\n\n保存期间继续写的内容',
    );
  });

  it("migrates recovery snapshots created before firstPublishedAt existed", () => {
    const legacy = {
      title: "旧恢复副本",
      date: "2026-08-01 10:00:00",
      updated: "2026-08-02 10:00:00",
      slug: "legacy-recovery",
      tags: [],
      categories: [],
      excerpt: "",
      cover: "",
      draft: true,
      layout: "post",
      permalink: "",
    };
    expect(migrateRecoveredFrontMatter(legacy).firstPublishedAt).toBe("");
    expect(
      migrateRecoveredFrontMatter(legacy, {
        ...legacy,
        draft: false,
        firstPublishedAt: "2026-07-31 09:00:00",
      }).firstPublishedAt,
    ).toBe("2026-07-31 09:00:00");
  });

  it("keeps both ends of long article content within the AI input limit", () => {
    const content = `开头-${"中".repeat(20_000)}-结尾`;
    const compact = articleContentForAi(content, 1_000);
    expect(compact.length).toBeLessThanOrEqual(1_000);
    expect(compact).toContain("开头-");
    expect(compact).toContain("-结尾");
    expect(compact).toContain("正文中间已截断");
  });
});
