import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MockRepositoryAdapter } from "@/lib/repository/mock";
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

describe("MockRepositoryAdapter", () => {
  it("exposes a manual workflow run after dispatch", async () => {
    const repository = new MockRepositoryAdapter(config);
    await repository.dispatchWorkflow();
    const runs = await repository.listWorkflowRuns();
    expect(runs[0].event).toBe("workflow_dispatch");
    expect(["queued", "in_progress"]).toContain(runs[0].status);
  });

  it("moves a draft to posts and keeps editable content", async () => {
    const repository = new MockRepositoryAdapter(config);
    const draft = (await repository.listPosts("draft"))[0];
    const document = await repository.getPost(draft.path);
    const result = await repository.savePost({
      currentPath: document.path,
      expectedSha: document.sha,
      expectedHeadSha: document.headSha,
      kind: "post",
      slug: document.slug,
      body: `${document.body}\n已完成。`,
      frontMatter: { ...document.frontMatter, draft: false },
    });
    expect(result.path).toBe("source/_posts/next-article.md");
    expect((await repository.listPosts("draft")).length).toBe(0);
    expect((await repository.getPost(result.path)).body).toContain("已完成");
  });

  it("detects stale SHA instead of overwriting", async () => {
    const repository = new MockRepositoryAdapter(config);
    const document = await repository.getPost(
      "source/_posts/welcome-to-lilpolaris.md",
    );
    await repository.savePost({
      currentPath: document.path,
      expectedSha: document.sha,
      kind: "post",
      slug: document.slug,
      body: `${document.body}\n第一次保存`,
      frontMatter: document.frontMatter,
    });
    await expect(
      repository.savePost({
        currentPath: document.path,
        expectedSha: document.sha,
        kind: "post",
        slug: document.slug,
        body: `${document.body}\n过期保存`,
        frontMatter: document.frontMatter,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<AppError>);
  });

  it("gives duplicated posts their own publication lifecycle", async () => {
    const repository = new MockRepositoryAdapter(config);
    const published = await repository.getPost(
      "source/_posts/welcome-to-lilpolaris.md",
    );
    const publishedCopy = await repository.duplicatePost(
      published.path,
      published.sha,
      "welcome-copy",
    );
    const copiedPost = await repository.getPost(publishedCopy.path);
    expect(copiedPost.frontMatter.date).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
    expect(copiedPost.frontMatter.date).not.toBe(published.frontMatter.date);
    expect(copiedPost.frontMatter.firstPublishedAt).toBe(
      copiedPost.frontMatter.date,
    );
    expect(copiedPost.sha).not.toBe(published.sha);

    const draft = await repository.getPost(
      "source/_drafts/next-article.md",
    );
    const draftCopy = await repository.duplicatePost(
      draft.path,
      draft.sha,
      "next-article-copy",
    );
    const copiedDraft = await repository.getPost(draftCopy.path);
    expect(copiedDraft.frontMatter.date).toBe("");
    expect(copiedDraft.frontMatter.firstPublishedAt).toBe("");
  });

  it("uploads, lists, and deletes media", async () => {
    const repository = new MockRepositoryAdapter(config);
    const media = await repository.uploadMedia({
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      name: "封面.png",
      contentType: "image/png",
    });
    expect(media.path).toMatch(
      /^source\/img\/\d{8}-image-[0-9a-f]{6}\.png$/,
    );
    expect(await repository.listMedia()).toHaveLength(1);
    await repository.deleteMedia(media.path, media.sha);
    expect(await repository.listMedia()).toHaveLength(0);
  });

  it("renames tags across affected posts", async () => {
    const repository = new MockRepositoryAdapter(config);
    const result = await repository.renameTaxonomy({
      type: "tag",
      from: "Hexo",
      to: "Hexo 8",
    });
    expect(result.affected).toBe(1);
    const post = (await repository.listPosts("post"))[0];
    expect(post.tags).toContain("Hexo 8");
  });

  it("saves Markdown and pending images as one bundle", async () => {
    const repository = new MockRepositoryAdapter(config);
    const source = await repository.getPost(
      "source/_drafts/next-article.md",
    );
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const body = `${source.body}\n{% asset_img "paste.png" "截图" %}`;
    const staged = await repository.stagePostMedia({
      id: "pending-1",
      referenceName: "paste.png",
      preparedName: "20260830-paste-abcdef.png",
      contentType: "image/png",
      bytes: image,
    });
    expect(await repository.listMedia()).toHaveLength(0);
    const result = await repository.savePostBundle({
      currentPath: source.path,
      expectedSha: source.sha,
      expectedHeadSha: source.headSha,
      kind: "draft",
      slug: source.slug,
      body,
      frontMatter: source.frontMatter,
      media: [staged],
    });
    expect(result.body).toContain(
      '{% asset_img "20260830-paste-abcdef.png" "截图" %}',
    );
    expect(result.mediaNamesById).toEqual({
      "pending-1": "20260830-paste-abcdef.png",
    });
    expect(result.uploadedMedia[0].path).toBe(
      "source/_drafts/next-article/20260830-paste-abcdef.png",
    );
    expect((await repository.getPost(result.path)).body).toContain(
      "asset_img",
    );
    expect(result.commitSha).toBe(result.headSha);
  });

  it("rolls back the entire bundle when a staged blob is missing", async () => {
    const repository = new MockRepositoryAdapter(config);
    const beforeMedia = await repository.listMedia();
    await expect(
      repository.savePostBundle({
        kind: "draft",
        slug: "atomic-failure",
        body: '{% asset_img "bad.png" "坏图片" %}',
        frontMatter: {
          title: "原子失败",
          date: "2026-07-24 12:00:00",
          firstPublishedAt: "",
          updated: "2026-07-24 12:00:00",
          slug: "atomic-failure",
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
            id: "bad",
            referenceName: "bad.png",
            preparedName: "20260830-bad-abcdef.png",
            contentType: "image/png",
            size: 8,
            blobSha: "f".repeat(40),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      repository.getPost("source/_drafts/atomic-failure.md"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await repository.listMedia()).toEqual(beforeMedia);
  });

  it("rejects pending image bundles larger than 32 MiB", async () => {
    const repository = new MockRepositoryAdapter(config);
    const media = Array.from({ length: 10 }, (_, index) => ({
      id: `large-${index}`,
      referenceName: `large-${index}.png`,
      preparedName: `20260830-large-${index}-${index.toString(16).padStart(6, "0")}.png`,
      contentType: "image/png",
      size: Math.floor(3.5 * 1024 * 1024),
      blobSha: index.toString(16).padStart(40, "0"),
    }));
    await expect(
      repository.savePostBundle({
        kind: "draft",
        slug: "too-many-images",
        body: "",
        frontMatter: {
          title: "图片过大",
          date: "2026-07-24 12:00:00",
          firstPublishedAt: "",
          updated: "2026-07-24 12:00:00",
          slug: "too-many-images",
          tags: [],
          categories: [],
          excerpt: "",
          cover: "",
          draft: true,
          layout: "post",
          permalink: "",
        },
        media,
      }),
    ).rejects.toMatchObject({
      code: "UPLOAD_INVALID",
      status: 413,
    });
  });
});
