import { describe, expect, it } from "vitest";
import {
  parsePostListState,
  postListUrl,
  safePostListReturnTo,
} from "@/lib/post-list-state";

describe("post list URL state", () => {
  it("round-trips filters, sorting and pagination", () => {
    const state = parsePostListState(
      "?query=hexo&status=draft&category=%E6%95%99%E7%A8%8B&tag=GitHub&sort=date&page=3",
    );
    expect(state).toEqual({
      query: "hexo",
      status: "draft",
      category: "教程",
      tag: "GitHub",
      sort: "date",
      page: 3,
    });
    expect(postListUrl("/posts", state)).toContain("page=3");
  });

  it("normalizes invalid values and fixes draft-page status", () => {
    expect(parsePostListState("?status=nope&sort=nope&page=-2")).toMatchObject({
      status: "all",
      sort: "updated",
      page: 1,
    });
    expect(parsePostListState("?status=post", "draft").status).toBe("draft");
  });

  it("accepts only canonical local list return paths", () => {
    expect(
      safePostListReturnTo(
        "/drafts?query=note&status=post&page=2&unexpected=value",
      ),
    ).toBe("/drafts?query=note&page=2");
    expect(safePostListReturnTo("https://example.com/posts")).toBe("/posts");
    expect(safePostListReturnTo("//example.com/posts")).toBe("/posts");
  });
});
