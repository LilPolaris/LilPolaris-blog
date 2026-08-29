import { describe, expect, it } from "vitest";
import { frontMatterSchema } from "@/lib/validation";

const frontMatter = {
  title: "测试文章",
  date: "",
  firstPublishedAt: "",
  updated: "2026-08-29 18:00:00",
  slug: "test-post",
  tags: [],
  categories: [],
  excerpt: "",
  cover: "",
  draft: true,
  layout: "post",
  permalink: "",
};

describe("front matter validation", () => {
  it("accepts an empty or valid first publication timestamp", () => {
    expect(frontMatterSchema.safeParse(frontMatter).success).toBe(true);
    expect(
      frontMatterSchema.safeParse({
        ...frontMatter,
        firstPublishedAt: "2026-08-29 18:00:01",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid first publication text and calendar dates", () => {
    expect(
      frontMatterSchema.safeParse({
        ...frontMatter,
        firstPublishedAt: "tomorrow",
      }).success,
    ).toBe(false);
    expect(
      frontMatterSchema.safeParse({
        ...frontMatter,
        firstPublishedAt: "2026-02-29 18:00:01",
      }).success,
    ).toBe(false);
  });
});
