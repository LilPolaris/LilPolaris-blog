import { describe, expect, it } from "vitest";
import {
  applyPresetTemplate,
  buildEditorContext,
  resolvePreset,
} from "@/lib/editor-context";
import type {
  PostPreset,
  PostSummary,
  RepositoryConfig,
} from "@/lib/types";

const preset: PostPreset = {
  id: "rambling",
  label: "随笔",
  slugTemplate: "rambling-{seq:02}",
  titleTemplate: "随笔-{seq:02}",
  tags: [],
  categories: [["随笔"]],
  layout: "post",
};

const config: RepositoryConfig = {
  owner: "LilPolaris",
  repo: "LilPolaris-blog",
  branch: "main",
  postsPath: "source/_posts",
  draftsPath: "source/_drafts",
  imagesPath: "source/img",
  publicBlogUrl: "https://lilpolaris.github.io",
  timezone: "Asia/Shanghai",
  workflowId: "deploy.yml",
  defaultLayout: "post",
  defaultCategory: "",
  commitTemplate: "content: {action} post {slug}",
  autoDispatch: false,
  uploadLimitMb: 8,
  adapter: "mock",
  editorDefaultMode: "live",
  postPresets: [preset],
};

function post(slug: string, kind: "post" | "draft"): PostSummary {
  return {
    id: slug,
    path: `source/_${kind === "post" ? "posts" : "drafts"}/${slug}.md`,
    kind,
    sha: slug,
    title: slug,
    slug,
    date: "2026-07-24 12:00:00",
    updated: "2026-07-24 12:00:00",
    tags: ["写作"],
    categories: [["随笔"]],
    excerpt: "",
    draft: kind === "draft",
  };
}

describe("editor context", () => {
  it("finds the next free preset sequence across posts and drafts", () => {
    const context = buildEditorContext(
      [
        post("rambling-01", "post"),
        post("rambling-02", "draft"),
        post("rambling-03", "post"),
      ],
      config,
    );
    expect(context.presets[0]).toMatchObject({
      nextSequence: 4,
      suggestedSlug: "rambling-04",
      suggestedTitle: "随笔-04",
    });
  });

  it("supports date and padded sequence tokens", () => {
    expect(
      applyPresetTemplate(
        "note-{date}-{seq:03}",
        7,
        new Date(2026, 6, 24),
      ),
    ).toBe("note-2026-07-24-007");
    expect(resolvePreset(preset, new Set(["rambling-01"])).nextSequence).toBe(2);
  });

  it("returns preferred categories and usage counts", () => {
    const context = buildEditorContext([post("rambling-01", "post")], config);
    expect(context.tags[0]).toMatchObject({ label: "写作", count: 1 });
    expect(context.categories.slice(0, 5).map((item) => item.label)).toEqual([
      "随笔",
      "教程 > 分享",
      "大学 > 课程测评",
      "高中 > 三位一体",
      "高中 > 语文",
    ]);
  });
});
