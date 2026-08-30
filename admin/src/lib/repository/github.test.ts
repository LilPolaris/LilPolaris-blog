import { describe, expect, it, vi } from "vitest";
import { GitHubRepositoryAdapter } from "@/lib/repository/github";
import type {
  PostBundleMutationInput,
  RepositoryConfig,
} from "@/lib/types";

function config(repo: string): RepositoryConfig {
  return {
    owner: "test-owner",
    repo,
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
    adapter: "github",
    editorDefaultMode: "live",
    postPresets: [],
  };
}

function markdown(index: number) {
  return `---\ntitle: Article ${index}\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-01 12:00:00\n---\nBody ${index}`;
}

function attachOctokit(
  adapter: GitHubRepositoryAdapter,
  octokit: Record<string, unknown>,
) {
  Object.defineProperty(adapter, "octokit", { value: octokit });
}

function readFixture(entries: Array<{ path: string; sha: string }>) {
  return {
    rest: {
      git: {
        getRef: vi.fn(async () => ({ data: { object: { sha: "head-sha" } } })),
        getCommit: vi.fn(async () => ({ data: { tree: { sha: "tree-sha" } } })),
        getTree: vi.fn(async () => ({
          data: {
            truncated: false,
            tree: entries.map((entry) => ({ ...entry, type: "blob" })),
          },
        })),
        getBlob: vi.fn(async ({ file_sha }: { file_sha: string }) => ({
          data: {
            content: Buffer.from(
              markdown(Number.parseInt(file_sha.slice(-2), 16)),
            ).toString("base64"),
          },
        })),
      },
    },
  };
}

describe("GitHubRepositoryAdapter reads", () => {
  it("bounds blob concurrency and reuses head, tree, and blob caches", async () => {
    const entries = Array.from({ length: 14 }, (_, index) => ({
      path: `source/_posts/article-${index}.md`,
      sha: (index + 1).toString(16).padStart(40, "0"),
    }));
    const fixture = readFixture(entries);
    let active = 0;
    let maximumActive = 0;
    fixture.rest.git.getBlob.mockImplementation(
      async ({ file_sha }: { file_sha: string }) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          data: {
            content: Buffer.from(
              markdown(Number.parseInt(file_sha.slice(-2), 16)),
            ).toString("base64"),
          },
        };
      },
    );
    const adapter = new GitHubRepositoryAdapter(
      config("bounded-concurrency"),
      "token",
    );
    attachOctokit(adapter, fixture);

    expect(await adapter.listPosts()).toHaveLength(entries.length);
    expect(maximumActive).toBe(6);
    expect(fixture.rest.git.getRef).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getCommit).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getTree).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getBlob).toHaveBeenCalledTimes(entries.length);

    const secondFixture = readFixture([]);
    const secondAdapter = new GitHubRepositoryAdapter(
      config("bounded-concurrency"),
      "another-token",
    );
    attachOctokit(secondAdapter, secondFixture);
    expect(await secondAdapter.listPosts()).toHaveLength(entries.length);
    await expect(secondAdapter.getPost(entries[0].path)).resolves.toMatchObject({
      path: entries[0].path,
      sha: entries[0].sha,
    });
    expect(secondFixture.rest.git.getRef).not.toHaveBeenCalled();
    expect(secondFixture.rest.git.getTree).not.toHaveBeenCalled();
    expect(secondFixture.rest.git.getBlob).not.toHaveBeenCalled();
  });

  it("retries transient reads with backoff but never retries a write", async () => {
    const fixture = readFixture([]);
    fixture.rest.git.getRef
      .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 503 }));
    const createOrUpdateFileContents = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("write failed"), { status: 503 }));
    const octokit = {
      ...fixture,
      rest: {
        ...fixture.rest,
        repos: { createOrUpdateFileContents },
      },
    };
    const adapter = new GitHubRepositoryAdapter(config("read-retry"), "token");
    attachOctokit(adapter, octokit);

    await expect(adapter.listPosts()).resolves.toEqual([]);
    expect(fixture.rest.git.getRef).toHaveBeenCalledTimes(3);
    await expect(
      adapter.uploadMedia({
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        name: "cover.png",
        contentType: "image/png",
      }),
    ).rejects.toThrow("write failed");
    expect(createOrUpdateFileContents).toHaveBeenCalledTimes(1);
  });

  it("puts blob SHA in media URLs and bypasses the tree for SHA reads", async () => {
    const sha = "a".repeat(40);
    const fixture = readFixture([{ path: "source/img/cover.png", sha }]);
    fixture.rest.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString(
          "base64",
        ),
      },
    });
    const adapter = new GitHubRepositoryAdapter(config("media-sha"), "token");
    attachOctokit(adapter, fixture);

    const [asset] = await adapter.listMedia();
    const url = new URL(asset.downloadUrl!, "https://admin.example.com");
    expect(url.searchParams.get("path")).toBe(asset.path);
    expect(url.searchParams.get("sha")).toBe(sha);
    expect(fixture.rest.git.getTree).toHaveBeenCalledTimes(1);

    await expect(
      adapter.getMedia(asset.path, "b".repeat(40)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(fixture.rest.git.getTree).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getBlob).not.toHaveBeenCalled();

    const media = await adapter.getMedia(asset.path, sha);
    expect(media.etag).toBe(sha);
    expect(fixture.rest.git.getTree).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getBlob).toHaveBeenCalledTimes(1);
  });

  it("verifies an unapproved path and SHA against one cached tree", async () => {
    const sha = "c".repeat(40);
    const path = "source/_posts/article/cover.png";
    const fixture = readFixture([{ path, sha }]);
    fixture.rest.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString(
          "base64",
        ),
      },
    });
    const adapter = new GitHubRepositoryAdapter(
      config("media-tree-fallback"),
      "token",
    );
    attachOctokit(adapter, fixture);

    await expect(adapter.getMedia(path, sha)).resolves.toMatchObject({
      etag: sha,
      contentType: "image/png",
    });
    await expect(adapter.getMedia(path, sha)).resolves.toMatchObject({
      etag: sha,
    });

    expect(fixture.rest.git.getRef).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getTree).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.getBlob).toHaveBeenCalledTimes(2);
  });

  it("rejects image-like blobs outside configured media directories", async () => {
    const fixture = readFixture([]);
    const adapter = new GitHubRepositoryAdapter(
      config("media-path-scope"),
      "token",
    );
    attachOctokit(adapter, fixture);

    for (const path of [
      "private/secret.png",
      "source/_posts/loose.png",
      "source/img/not-an-image.txt",
    ]) {
      await expect(
        adapter.getMedia(path, "d".repeat(40)),
      ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    }
    expect(fixture.rest.git.getRef).not.toHaveBeenCalled();
    expect(fixture.rest.git.getTree).not.toHaveBeenCalled();
    expect(fixture.rest.git.getBlob).not.toHaveBeenCalled();
  });
});

function bundleInput(
  blobSha = "a".repeat(40),
): PostBundleMutationInput {
  return {
    kind: "draft",
    slug: "atomic-post",
    body: '{% asset_img "before.png" "截图" %}',
    frontMatter: {
      title: "原子提交",
      date: "",
      firstPublishedAt: "",
      updated: "2026-08-30 10:00:00",
      slug: "atomic-post",
      tags: [],
      categories: [],
      excerpt: "",
      cover: "",
      draft: true,
      layout: "post",
      permalink: "",
    },
    media: [
      {
        id: "pending-1",
        referenceName: "before.png",
        preparedName: "20260830-before-abcdef.png",
        contentType: "image/png",
        size: 8,
        blobSha,
      },
    ],
  };
}

function writeFixture(failAt?: "blob" | "tree" | "commit" | "ref") {
  let publishedHead = "head-sha";
  const createTree = vi.fn(async () => {
    if (failAt === "tree") throw new Error("tree failed");
    return { data: { sha: "new-tree-sha", tree: [] } };
  });
  const createCommit = vi.fn(async () => {
    if (failAt === "commit") throw new Error("commit failed");
    return { data: { sha: "new-commit-sha" } };
  });
  const updateRef = vi.fn(async ({ sha }: { sha: string }) => {
    if (failAt === "ref") throw new Error("ref failed");
    publishedHead = sha;
    return { data: {} };
  });
  const createBlob = vi.fn(async () => {
    if (failAt === "blob") throw new Error("blob failed");
    return { data: { sha: "b".repeat(40) } };
  });
  return {
    get publishedHead() {
      return publishedHead;
    },
    rest: {
      git: {
        getRef: vi.fn(async () => ({ data: { object: { sha: "head-sha" } } })),
        getCommit: vi.fn(async () => ({ data: { tree: { sha: "tree-sha" } } })),
        getTree: vi.fn(async () => ({
          data: { truncated: false, tree: [] },
        })),
        getBlob: vi.fn(),
        createBlob,
        createTree,
        createCommit,
        updateRef,
      },
    },
  };
}

describe("GitHubRepositoryAdapter staged writes", () => {
  it("stages an image with createBlob only", async () => {
    const createBlob = vi.fn(async () => ({ data: { sha: "a".repeat(40) } }));
    const octokit = { rest: { git: { createBlob } } };
    const adapter = new GitHubRepositoryAdapter(config("stage-only"), "token");
    attachOctokit(adapter, octokit);

    await expect(
      adapter.stagePostMedia({
        id: "pending-1",
        referenceName: "before.png",
        preparedName: "20260830-before-abcdef.png",
        contentType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    ).resolves.toMatchObject({
      id: "pending-1",
      blobSha: "a".repeat(40),
      size: 8,
    });
    expect(createBlob).toHaveBeenCalledTimes(1);
    expect(Object.keys(octokit.rest.git)).toEqual(["createBlob"]);
  });

  it("does not attempt a commit when staging createBlob fails", async () => {
    const createBlob = vi.fn(async () => {
      throw new Error("stage failed");
    });
    const octokit = { rest: { git: { createBlob } } };
    const adapter = new GitHubRepositoryAdapter(config("stage-failure"), "token");
    attachOctokit(adapter, octokit);

    await expect(
      adapter.stagePostMedia({
        id: "pending-1",
        referenceName: "before.png",
        preparedName: "20260830-before-abcdef.png",
        contentType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    ).rejects.toThrow("stage failed");
    expect(createBlob).toHaveBeenCalledTimes(1);
    expect(Object.keys(octokit.rest.git)).toEqual(["createBlob"]);
  });

  it("finalizes Markdown and staged images with one tree, commit, and ref update", async () => {
    const fixture = writeFixture();
    fixture.rest.git.createBlob
      .mockResolvedValueOnce({ data: { sha: "a".repeat(40) } })
      .mockResolvedValueOnce({ data: { sha: "b".repeat(40) } });
    const adapter = new GitHubRepositoryAdapter(config("atomic-success"), "token");
    attachOctokit(adapter, fixture);

    const staged = await adapter.stagePostMedia({
      id: "pending-1",
      referenceName: "before.png",
      preparedName: "20260830-before-abcdef.png",
      contentType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    expect(fixture.rest.git.createBlob).toHaveBeenCalledTimes(1);
    const input = bundleInput(staged.blobSha);
    input.media = [staged];
    const result = await adapter.savePostBundle(input);

    expect(fixture.rest.git.createBlob).toHaveBeenCalledTimes(2);
    expect(fixture.rest.git.createTree).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.createCommit).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.updateRef).toHaveBeenCalledTimes(1);
    expect(fixture.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: expect.arrayContaining([
          expect.objectContaining({
            path: "source/_drafts/atomic-post/20260830-before-abcdef.png",
            sha: "a".repeat(40),
          }),
        ]),
      }),
    );
    expect(fixture.publishedHead).toBe("new-commit-sha");
    expect(result.mediaNamesById).toEqual({
      "pending-1": "20260830-before-abcdef.png",
    });
  });

  it.each(["blob", "tree", "commit", "ref"] as const)(
    "does not move the branch when %s creation fails",
    async (failAt) => {
      const fixture = writeFixture(failAt);
      const adapter = new GitHubRepositoryAdapter(
        config(`atomic-failure-${failAt}`),
        "token",
      );
      attachOctokit(adapter, fixture);

      await expect(adapter.savePostBundle(bundleInput())).rejects.toThrow(
        `${failAt} failed`,
      );
      expect(fixture.publishedHead).toBe("head-sha");
      expect(fixture.rest.git.createTree).toHaveBeenCalledTimes(
        failAt === "blob" ? 0 : 1,
      );
      expect(fixture.rest.git.createCommit).toHaveBeenCalledTimes(
        failAt === "blob" || failAt === "tree" ? 0 : 1,
      );
      expect(fixture.rest.git.updateRef).toHaveBeenCalledTimes(
        failAt === "ref" ? 1 : 0,
      );
    },
  );
});
