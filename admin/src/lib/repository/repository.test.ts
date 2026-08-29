import { describe, expect, it, vi } from "vitest";
import { MockRepositoryAdapter } from "@/lib/repository/mock";
import { getDashboardData } from "@/lib/repository/repository";
import type { RepositoryConfig } from "@/lib/types";

const config: RepositoryConfig = {
  owner: "test-owner",
  repo: "dashboard",
  branch: "main",
  postsPath: "source/_posts",
  draftsPath: "source/_drafts",
  imagesPath: "source/img",
  publicBlogUrl: "https://example.com",
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

describe("getDashboardData", () => {
  it("loads posts once and degrades connection and workflow independently", async () => {
    const repository = new MockRepositoryAdapter(config);
    const summaries = await repository.listPosts();
    const listPosts = vi.spyOn(repository, "listPosts").mockResolvedValue(summaries);
    vi.spyOn(repository, "checkConnection").mockRejectedValue(
      new Error("connection unavailable"),
    );
    vi.spyOn(repository, "listWorkflowRuns").mockRejectedValue(
      new Error("workflow unavailable"),
    );

    const data = await getDashboardData(repository);

    expect(listPosts).toHaveBeenCalledTimes(1);
    expect(listPosts).toHaveBeenCalledWith();
    expect(data.totalPosts).toBe(
      summaries.filter((post) => post.kind === "post").length,
    );
    expect(data.totalDrafts).toBe(
      summaries.filter((post) => post.kind === "draft").length,
    );
    expect(data.repositoryConnected).toBe(false);
    expect(data.latestRun).toBeNull();
    expect(data.sourceStatus).toEqual({
      posts: "ok",
      connection: "error",
      workflow: "error",
    });
    expect(data.sourceErrors).toEqual({
      connection: "connection unavailable",
      workflow: "workflow unavailable",
    });
  });

  it("returns an explicit empty-state instead of throwing when posts fail", async () => {
    const repository = new MockRepositoryAdapter(config);
    vi.spyOn(repository, "listPosts").mockRejectedValue(
      new Error("post read unavailable"),
    );

    const data = await getDashboardData(repository);

    expect(data.totalPosts).toBe(0);
    expect(data.totalDrafts).toBe(0);
    expect(data.recentUpdated).toEqual([]);
    expect(data.repositoryConnected).toBe(true);
    expect(data.sourceStatus).toMatchObject({
      posts: "error",
      connection: "ok",
      workflow: "ok",
    });
    expect(data.sourceErrors).toEqual({ posts: "post read unavailable" });
  });
});
