import { describe, expect, it } from "vitest";
import { normalizeRepoPath, postPath, validateSlug } from "@/lib/path";
import type { RepositoryConfig } from "@/lib/types";

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
  postPresets: [],
};

describe("repository paths", () => {
  it("builds post and draft paths", () => {
    expect(postPath(config, "post", "hello-world")).toBe(
      "source/_posts/hello-world.md",
    );
    expect(postPath(config, "draft", "hello-world")).toBe(
      "source/_drafts/hello-world.md",
    );
  });

  it("rejects traversal and unsafe slugs", () => {
    expect(() => normalizeRepoPath("../secrets")).toThrow();
    expect(() => validateSlug("../../bad")).toThrow();
    expect(() => validateSlug("带空格")).toThrow();
  });
});
