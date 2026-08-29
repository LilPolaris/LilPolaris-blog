import { describe, expect, it } from "vitest";
import { formatBlogTimestamp } from "@/lib/blog-time";
import {
  editableFrontMatter,
  parseMarkdown,
  renameTaxonomyInSource,
  serializeMarkdown,
} from "@/lib/front-matter";

const source = `---
title: >-
  Lil
  Polaris 大一总结
date: 2026-02-02 15:54:21
categories:
  - [大学, 课程测评]
tags:
  - 浙江大学
empty_value:
custom_field:
  nested: true
---
# 正文

中文内容。
`;

describe("Front Matter", () => {
  it("formats server timestamps explicitly in the blog timezone", () => {
    expect(
      formatBlogTimestamp(new Date("2026-08-29T09:05:07.000Z"), "Asia/Shanghai"),
    ).toBe("2026-08-29 17:05:07");
  });

  it("parses nested Hexo categories", () => {
    const parsed = parseMarkdown(source);
    const editable = editableFrontMatter(
      parsed.document,
      "freshman-year",
      "post",
    );
    expect(editable.categories).toEqual([["大学", "课程测评"]]);
    expect(editable.tags).toEqual(["浙江大学"]);
    expect(editable.title).toContain("Lil");
  });

  it("preserves unknown fields while patching known values", () => {
    const parsed = parseMarkdown(source);
    const editable = editableFrontMatter(
      parsed.document,
      "freshman-year",
      "post",
    );
    const output = serializeMarkdown(
      source,
      {
        ...editable,
        title: "新的标题",
        tags: [...editable.tags, "大一上"],
      },
      parsed.body,
    );
    const reparsed = parseMarkdown(output).document.toJS() as Record<
      string,
      unknown
    >;
    expect(reparsed.custom_field).toEqual({ nested: true });
    expect(reparsed).toHaveProperty("empty_value", null);
    expect(reparsed.title).toBe("新的标题");
    expect(reparsed.tags).toEqual(["浙江大学", "大一上"]);
    expect(output).toContain("# 正文");
  });

  it("renames a taxonomy entry without dropping other metadata", () => {
    const result = renameTaxonomyInSource(
      source,
      "category",
      "课程测评",
      "课程体验",
    );
    expect(result.changed).toBe(true);
    const value = parseMarkdown(result.source).document.toJS() as Record<
      string,
      unknown
    >;
    expect(value.categories).toEqual([["大学", "课程体验"]]);
    expect(value.custom_field).toEqual({ nested: true });
  });

  it("renames only the exact category path when leaf names are duplicated", () => {
    const duplicated = `---
title: 同名分类
categories:
  - [大学, 课程测评]
  - [工作, 课程测评]
---
# 正文
`;
    const result = renameTaxonomyInSource(
      duplicated,
      "category",
      "课程测评",
      "课程体验",
      ["大学", "课程测评"],
    );
    const value = parseMarkdown(result.source).document.toJS() as Record<
      string,
      unknown
    >;

    expect(result.changed).toBe(true);
    expect(value.categories).toEqual([
      ["大学", "课程体验"],
      ["工作", "课程测评"],
    ]);
  });

  it("does not rename a category when the full path does not match", () => {
    const result = renameTaxonomyInSource(
      source,
      "category",
      "课程测评",
      "课程体验",
      ["工作", "课程测评"],
    );

    expect(result).toEqual({ changed: false, source });
  });

  it("keeps an unpublished draft date empty", () => {
    const output = serializeMarkdown(
      undefined,
      {
        title: "草稿",
        date: "2026-08-01 08:00:00",
        firstPublishedAt: "",
        updated: "2026-08-01 08:00:00",
        slug: "draft",
        tags: ["写作"],
        categories: [["随笔"]],
        excerpt: "",
        cover: "",
        draft: true,
        layout: "post",
        permalink: "",
      },
      "正文",
      { now: new Date("2026-08-29T09:05:07.000Z"), timeZone: "Asia/Shanghai" },
    );
    const value = parseMarkdown(output).document.toJS() as Record<string, unknown>;
    expect(value).not.toHaveProperty("date");
    expect(value).not.toHaveProperty("first_published_at");
  });

  it("uses the first publish action instead of draft creation as the publish time", () => {
    const draftSource = `---\ntitle: 旧草稿\ndate: 2026-08-01 08:00:00\nupdated: 2026-08-20 09:00:00\ntags: [写作]\ncategories: [随笔]\n---\n正文`;
    const parsed = parseMarkdown(draftSource);
    const draft = editableFrontMatter(parsed.document, "old-draft", "draft");
    const output = serializeMarkdown(
      draftSource,
      { ...draft, draft: false },
      parsed.body,
      {
        sourceKind: "draft",
        updateTimestamp: true,
        now: new Date("2026-08-29T09:05:07.000Z"),
        timeZone: "Asia/Shanghai",
      },
    );
    const value = parseMarkdown(output).document.toJS() as Record<string, unknown>;
    expect(value.date).toBe("2026-08-29 17:05:07");
    expect(value.first_published_at).toBe("2026-08-29 17:05:07");
    expect(value.updated).toBe("2026-08-29 17:05:07");
  });

  it("preserves the first online time after unpublishing and republishing", () => {
    const publishedSource = `---\ntitle: 已发布\ndate: 2026-08-10 10:11:12\nupdated: 2026-08-10 10:11:12\ntags: [写作]\ncategories: [随笔]\n---\n正文`;
    const publishedParsed = parseMarkdown(publishedSource);
    const published = editableFrontMatter(
      publishedParsed.document,
      "published",
      "post",
    );
    const draftSource = serializeMarkdown(
      publishedSource,
      { ...published, draft: true },
      publishedParsed.body,
      {
        sourceKind: "post",
        updateTimestamp: true,
        now: new Date("2026-08-20T00:00:00.000Z"),
        timeZone: "Asia/Shanghai",
      },
    );
    const draftParsed = parseMarkdown(draftSource);
    const draft = editableFrontMatter(draftParsed.document, "published", "draft");
    const republishedSource = serializeMarkdown(
      draftSource,
      { ...draft, draft: false },
      draftParsed.body,
      {
        sourceKind: "draft",
        updateTimestamp: true,
        now: new Date("2026-08-29T09:05:07.000Z"),
        timeZone: "Asia/Shanghai",
      },
    );
    const value = parseMarkdown(republishedSource).document.toJS() as Record<
      string,
      unknown
    >;
    expect(value.date).toBe("2026-08-10 10:11:12");
    expect(value.first_published_at).toBe("2026-08-10 10:11:12");
    expect(value.updated).toBe("2026-08-29 17:05:07");
  });
});
