import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import {
  STAGED_IMAGE_MAX_BYTES,
  validateStagedImageBytes,
} from "@/lib/image-upload";
import {
  assertPreparedMediaName,
  prepareOrReuseMediaFileName,
  replaceAssetImageReference,
  uniqueMediaName,
  validateImageFileExtension,
} from "@/lib/media-name";
import {
  renameTaxonomyInSource,
  serializeMarkdown,
} from "@/lib/front-matter";
import {
  assetDirectoryFromPostPath,
  normalizeRepoPath,
  postPath,
  validateSlug,
} from "@/lib/path";
import {
  kindFromPath,
  postFromSource,
  summaryFromDocument,
} from "@/lib/repository/post-model";
import type { RepositoryAdapter } from "@/lib/repository/repository";
import type {
  MediaAsset,
  MutationResult,
  PostBundleMutationInput,
  PostBundleMutationResult,
  PostDocument,
  PostKind,
  PostMutationInput,
  PostSummary,
  RenameTaxonomyInput,
  RepositoryConfig,
  StagePostMediaInput,
  StagedPostMedia,
  TaxonomyMutationResult,
  WorkflowRun,
} from "@/lib/types";

type MockFile = {
  bytes: Uint8Array;
  sha: string;
  updatedAt: string;
};

function sha(value: Uint8Array | string) {
  return createHash("sha1").update(value).digest("hex");
}

function textFile(source: string): MockFile {
  return {
    bytes: new TextEncoder().encode(source),
    sha: sha(source),
    updatedAt: new Date().toISOString(),
  };
}

function contentType(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      avif: "image/avif",
    }[extension || ""] || "application/octet-stream"
  );
}

export class MockRepositoryAdapter implements RepositoryAdapter {
  private readonly files = new Map<string, MockFile>();
  private readonly stagedBlobs = new Map<string, MockFile>();
  private headSha = sha("initial");
  private dispatchedWorkflow?: {
    commitSha: string;
    id: number;
    startedAt: number;
  };

  constructor(private readonly config: RepositoryConfig) {
    this.files.set(
      `${config.postsPath}/welcome-to-lilpolaris.md`,
      textFile(`---
title: 欢迎来到 Lil Polaris
date: 2026-06-13 12:19:15
updated: 2026-06-13 12:33:45
tags:
  - Hexo
  - 写作
categories:
  - [教程, 博客]
keywords: Hexo, GitHub Pages
description: 这是一篇用于后台 Mock 模式的示例文章。
custom_field:
  keep: true
---
# 一篇真实可编辑的 Markdown

这里展示 **GitHub Flavored Markdown**、代码和数学公式。

| 功能 | 状态 |
| --- | --- |
| Front Matter | 已保留 |
| 本地恢复 | 已启用 |

\`\`\`ts
const blog = "LilPolaris";
\`\`\`

行内公式 $E = mc^2$。
`),
    );
    this.files.set(
      `${config.draftsPath}/next-article.md`,
      textFile(`---
title: 下一篇文章
date: 2026-07-23 10:00:00
tags:
  - 草稿
categories:
  - 随笔
---
这是一份尚未发布的草稿。
`),
    );
  }

  private bump(message: string) {
    this.headSha = sha(`${this.headSha}:${message}:${Date.now()}`);
    return this.headSha;
  }

  private get(path: string) {
    const file = this.files.get(normalizeRepoPath(path));
    if (!file) throw new AppError("NOT_FOUND", "文件不存在。", 404);
    return file;
  }

  async checkConnection() {
    return true;
  }

  async listPosts(kind?: PostKind): Promise<PostSummary[]> {
    const roots =
      kind === "post"
        ? [this.config.postsPath]
        : kind === "draft"
          ? [this.config.draftsPath]
          : [this.config.postsPath, this.config.draftsPath];
    return [...this.files.entries()]
      .filter(
        ([path]) =>
          path.endsWith(".md") &&
          roots.some((root) => path.startsWith(`${root}/`)),
      )
      .map(([path, file]) =>
        summaryFromDocument(
          postFromSource({
            path,
            sha: file.sha,
            headSha: this.headSha,
            source: new TextDecoder().decode(file.bytes),
            config: this.config,
          }),
        ),
      )
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async getPost(path: string): Promise<PostDocument> {
    const normalized = normalizeRepoPath(path);
    const file = this.get(normalized);
    return postFromSource({
      path: normalized,
      sha: file.sha,
      headSha: this.headSha,
      source: new TextDecoder().decode(file.bytes),
      config: this.config,
    });
  }

  async savePost(input: PostMutationInput): Promise<MutationResult> {
    const slug = validateSlug(input.slug);
    const targetPath = postPath(this.config, input.kind, slug);
    const currentPath = input.currentPath
      ? normalizeRepoPath(input.currentPath)
      : undefined;
    const current = currentPath ? this.files.get(currentPath) : undefined;
    if (currentPath && !current) {
      throw new AppError("NOT_FOUND", "原文章不存在。", 404);
    }
    if (
      current &&
      input.expectedSha &&
      current.sha !== input.expectedSha &&
      !input.force
    ) {
      throw new AppError(
        "CONFLICT",
        "远程文章已发生变化。",
        409,
        {
          remoteSha: current.sha,
          remoteSource: new TextDecoder().decode(current.bytes),
        },
      );
    }
    if (targetPath !== currentPath && this.files.has(targetPath)) {
      throw new AppError("CONFLICT", "目标 slug 已存在。", 409);
    }
    const original = current
      ? new TextDecoder().decode(current.bytes)
      : undefined;
    const source = serializeMarkdown(
      original,
      { ...input.frontMatter, slug, draft: input.kind === "draft" },
      input.body,
      {
        updateTimestamp: Boolean(current),
        sourceKind: currentPath
          ? kindFromPath(currentPath, this.config)
          : undefined,
        timeZone: this.config.timezone,
      },
    );
    if (currentPath && currentPath !== targetPath) {
      this.files.delete(currentPath);
      const oldAssets = assetDirectoryFromPostPath(currentPath);
      const newAssets = assetDirectoryFromPostPath(targetPath);
      for (const [path, file] of [...this.files.entries()]) {
        if (path.startsWith(`${oldAssets}/`)) {
          this.files.delete(path);
          this.files.set(`${newAssets}/${path.slice(oldAssets.length + 1)}`, file);
        }
      }
    }
    const next = textFile(source);
    this.files.set(targetPath, next);
    const message = current
      ? `content: update post ${slug}`
      : `content: create ${input.kind} ${slug}`;
    const commitSha = this.bump(message);
    return {
      path: targetPath,
      sha: next.sha,
      headSha: commitSha,
      commitSha,
      message,
    };
  }

  async stagePostMedia(input: StagePostMediaInput): Promise<StagedPostMedia> {
    if (
      !input.id ||
      input.id.length > 100 ||
      !input.referenceName ||
      input.referenceName.length > 200
    ) {
      throw new AppError("VALIDATION", "图片暂存信息不合法。", 400);
    }
    assertPreparedMediaName(input.preparedName);
    validateStagedImageBytes(
      input.bytes,
      input.preparedName,
      input.contentType,
    );
    const blobSha = sha(input.bytes);
    this.stagedBlobs.set(blobSha, {
      bytes: input.bytes,
      sha: blobSha,
      updatedAt: new Date().toISOString(),
    });
    return {
      id: input.id,
      referenceName: input.referenceName,
      preparedName: input.preparedName,
      contentType: input.contentType,
      size: input.bytes.byteLength,
      blobSha,
    };
  }

  async savePostBundle(
    input: PostBundleMutationInput,
  ): Promise<PostBundleMutationResult> {
    if (!input.media.length) {
      return {
        ...(await this.savePost(input)),
        body: input.body,
        uploadedMedia: [],
        mediaNamesById: {},
      };
    }
    const snapshot = new Map(this.files);
    const snapshotHead = this.headSha;
    const totalBytes = input.media.reduce((total, media) => total + media.size, 0);
    if (totalBytes > 32 * 1024 * 1024) {
      throw new AppError(
        "UPLOAD_INVALID",
        "一篇文章的暂存图片总量不能超过 32 MiB。",
        413,
      );
    }

    try {
      if (
        input.expectedHeadSha &&
        input.expectedHeadSha !== this.headSha &&
        !input.force
      ) {
        throw new AppError("CONFLICT", "远程仓库已发生变化。", 409, {
          remoteHeadSha: this.headSha,
        });
      }
      const targetPath = postPath(
        this.config,
        input.kind,
        validateSlug(input.slug),
      );
      const assetDirectory = assetDirectoryFromPostPath(targetPath);
      const currentAssets = input.currentPath
        ? assetDirectoryFromPostPath(input.currentPath)
        : undefined;
      const reserved = new Set(
        [...this.files.keys()]
          .filter(
            (path) =>
              path.startsWith(`${assetDirectory}/`) ||
              Boolean(currentAssets && path.startsWith(`${currentAssets}/`)),
          )
          .map((path) => path.split("/").at(-1)!),
      );
      const mediaNamesById: Record<string, string> = {};
      const seenIds = new Set<string>();
      let finalBody = input.body;
      const prepared = input.media.map((media) => {
        if (seenIds.has(media.id)) {
          throw new AppError("VALIDATION", "图片暂存凭证包含重复项目。", 400);
        }
        seenIds.add(media.id);
        if (media.size <= 0 || media.size > STAGED_IMAGE_MAX_BYTES) {
          throw new AppError(
            "UPLOAD_INVALID",
            "准备后的单张图片不能超过 3.5 MiB。",
            413,
          );
        }
        assertPreparedMediaName(media.preparedName);
        validateImageFileExtension(media.preparedName, media.contentType);
        const staged = this.stagedBlobs.get(media.blobSha);
        if (!staged || staged.bytes.byteLength !== media.size) {
          throw new AppError(
            "VALIDATION",
            "图片暂存 Blob 不存在或已失效。",
            400,
          );
        }
        const name = uniqueMediaName(media.preparedName, reserved);
        reserved.add(name);
        mediaNamesById[media.id] = name;
        finalBody = replaceAssetImageReference(
          finalBody,
          media.referenceName,
          name,
        );
        return { ...media, name, staged };
      });
      const result = await this.savePost({ ...input, body: finalBody });
      const uploadedMedia: MediaAsset[] = [];
      for (const media of prepared) {
        const path = `${assetDirectoryFromPostPath(result.path)}/${media.name}`;
        this.files.set(path, {
          bytes: media.staged.bytes,
          sha: media.blobSha,
          updatedAt: new Date().toISOString(),
        });
        uploadedMedia.push({
          id: Buffer.from(path, "utf8").toString("base64url"),
          path,
          name: media.name,
          sha: media.blobSha,
          size: media.size,
          scope: "post",
          postSlug: input.slug,
          uploadedAt: new Date().toISOString(),
          downloadUrl: `/api/media/content?path=${encodeURIComponent(path)}`,
        });
      }
      this.headSha = snapshotHead;
      const message = `content: ${
        input.kind === "draft" ? "save draft bundle" : "publish bundle"
      } ${input.slug}`;
      const commitSha = this.bump(message);
      return {
        ...result,
        headSha: commitSha,
        commitSha,
        message,
        body: finalBody,
        mediaNamesById,
        uploadedMedia,
      };
    } catch (error) {
      this.files.clear();
      snapshot.forEach((file, path) => this.files.set(path, file));
      this.headSha = snapshotHead;
      throw error;
    }
  }

  async deletePost(
    path: string,
    expectedSha: string,
    deleteAssets: boolean,
  ): Promise<MutationResult> {
    const normalized = normalizeRepoPath(path);
    const current = this.get(normalized);
    if (current.sha !== expectedSha) {
      throw new AppError("CONFLICT", "远程文章已更新。", 409);
    }
    this.files.delete(normalized);
    if (deleteAssets) {
      const assets = assetDirectoryFromPostPath(normalized);
      for (const filePath of [...this.files.keys()]) {
        if (filePath.startsWith(`${assets}/`)) this.files.delete(filePath);
      }
    }
    const message = `content: delete post ${normalized.split("/").at(-1)}`;
    const commitSha = this.bump(message);
    return {
      path: normalized,
      sha: "",
      headSha: commitSha,
      commitSha,
      message,
    };
  }

  async duplicatePost(
    path: string,
    expectedSha: string,
    targetSlug: string,
  ): Promise<MutationResult> {
    const normalized = normalizeRepoPath(path);
    const current = this.get(normalized);
    if (current.sha !== expectedSha) {
      throw new AppError("CONFLICT", "远程文章已更新。", 409);
    }
    const targetPath = postPath(
      this.config,
      kindFromPath(normalized, this.config),
      targetSlug,
    );
    if (this.files.has(targetPath)) {
      throw new AppError("CONFLICT", "目标 slug 已存在。", 409);
    }
    const sourceText = new TextDecoder().decode(current.bytes);
    const kind = kindFromPath(normalized, this.config);
    const sourceDocument = postFromSource({
      path: normalized,
      sha: current.sha,
      headSha: this.headSha,
      source: sourceText,
      config: this.config,
    });
    const duplicated = textFile(
      serializeMarkdown(
        sourceText,
        {
          ...sourceDocument.frontMatter,
          slug: targetSlug,
          date: "",
          firstPublishedAt: "",
          draft: kind === "draft",
        },
        sourceDocument.body,
        {
          sourceKind: kind,
          resetPublication: true,
          timeZone: this.config.timezone,
        },
      ),
    );
    this.files.set(targetPath, duplicated);
    const oldAssets = assetDirectoryFromPostPath(normalized);
    const newAssets = assetDirectoryFromPostPath(targetPath);
    for (const [filePath, file] of [...this.files.entries()]) {
      if (filePath.startsWith(`${oldAssets}/`)) {
        this.files.set(`${newAssets}/${filePath.slice(oldAssets.length + 1)}`, {
          ...file,
        });
      }
    }
    const message = `content: duplicate post ${targetSlug}`;
    const commitSha = this.bump(message);
    return {
      path: targetPath,
      sha: duplicated.sha,
      headSha: commitSha,
      commitSha,
      message,
    };
  }

  async listMedia(): Promise<MediaAsset[]> {
    return [...this.files.entries()]
      .filter(([path]) => !path.endsWith(".md"))
      .map(([path, file]) => ({
        id: Buffer.from(path, "utf8").toString("base64url"),
        path,
        name: path.split("/").at(-1)!,
        sha: file.sha,
        size: file.bytes.byteLength,
        scope: path.startsWith(`${this.config.imagesPath}/`)
          ? ("global" as const)
          : ("post" as const),
        postSlug: path.startsWith(`${this.config.imagesPath}/`)
          ? undefined
          : path.split("/").at(-2),
        uploadedAt: file.updatedAt,
        downloadUrl: `/api/media/content?path=${encodeURIComponent(path)}`,
      }));
  }

  async getMedia(path: string) {
    const file = this.get(path);
    return {
      bytes: file.bytes,
      contentType: contentType(path),
      etag: file.sha,
    };
  }

  async uploadMedia(input: {
    bytes: Uint8Array;
    name: string;
    contentType: string;
    postPath?: string;
  }): Promise<MediaAsset> {
    const safeName = prepareOrReuseMediaFileName({
      originalName: input.name,
      uploadedFileName: input.name,
      contentType: input.contentType,
    });
    validateStagedImageBytes(input.bytes, safeName, input.contentType);
    const directory = input.postPath
      ? assetDirectoryFromPostPath(input.postPath)
      : this.config.imagesPath;
    const name = uniqueMediaName(
      safeName,
      [...this.files.keys()]
        .filter((path) => path.startsWith(`${directory}/`))
        .map((path) => path.split("/").at(-1)!),
    );
    const path = `${directory}/${name}`;
    const file: MockFile = {
      bytes: input.bytes,
      sha: sha(input.bytes),
      updatedAt: new Date().toISOString(),
    };
    this.files.set(path, file);
    this.bump(`media: upload ${name}`);
    return {
      id: Buffer.from(path, "utf8").toString("base64url"),
      path,
      name,
      sha: file.sha,
      size: file.bytes.byteLength,
      scope: input.postPath ? "post" : "global",
      postSlug: input.postPath
        ? assetDirectoryFromPostPath(input.postPath).split("/").at(-1)
        : undefined,
      uploadedAt: file.updatedAt,
      downloadUrl: `/api/media/content?path=${encodeURIComponent(path)}`,
    };
  }

  async deleteMedia(path: string, expectedSha: string) {
    const normalized = normalizeRepoPath(path);
    const current = this.get(normalized);
    if (current.sha !== expectedSha) {
      throw new AppError("CONFLICT", "远程媒体已更新。", 409);
    }
    this.files.delete(normalized);
    const message = `media: delete ${normalized.split("/").at(-1)}`;
    const commitSha = this.bump(message);
    return {
      path: normalized,
      sha: "",
      headSha: commitSha,
      commitSha,
      message,
    };
  }

  async listWorkflowRuns(): Promise<WorkflowRun[]> {
    const baseline: WorkflowRun =
      {
        id: 1001,
        name: "Deploy Hexo Site",
        branch: this.config.branch,
        event: "push",
        status: "completed",
        conclusion: "success",
        title: "content: update post welcome-to-lilpolaris",
        commitSha: this.headSha,
        startedAt: new Date(Date.now() - 90_000).toISOString(),
        updatedAt: new Date(Date.now() - 30_000).toISOString(),
        htmlUrl: `https://github.com/${this.config.owner}/${this.config.repo}/actions`,
      };
    if (!this.dispatchedWorkflow) return [baseline];
    const elapsed = Date.now() - this.dispatchedWorkflow.startedAt;
    const completed = elapsed >= 4_000;
    const queued = elapsed < 1_000;
    return [
      {
        id: this.dispatchedWorkflow.id,
        name: "Deploy Hexo Site",
        branch: this.config.branch,
        event: "workflow_dispatch",
        status: completed ? "completed" : queued ? "queued" : "in_progress",
        conclusion: completed ? "success" : null,
        title: "workflow_dispatch: manual deploy",
        commitSha: this.dispatchedWorkflow.commitSha,
        startedAt: new Date(this.dispatchedWorkflow.startedAt).toISOString(),
        updatedAt: new Date(
          completed ? this.dispatchedWorkflow.startedAt + 4_000 : Date.now(),
        ).toISOString(),
        htmlUrl: `https://github.com/${this.config.owner}/${this.config.repo}/actions`,
      },
      baseline,
    ];
  }

  async dispatchWorkflow() {
    const commitSha = this.bump("workflow_dispatch");
    this.dispatchedWorkflow = {
      commitSha,
      id: Math.max(1002, Date.now()),
      startedAt: Date.now(),
    };
  }

  async renameTaxonomy(
    input: RenameTaxonomyInput,
  ): Promise<TaxonomyMutationResult> {
    if (input.expectedHeadSha && input.expectedHeadSha !== this.headSha) {
      throw new AppError("CONFLICT", "仓库已发生变化。", 409);
    }
    let affected = 0;
    for (const [path, file] of [...this.files.entries()]) {
      if (!path.endsWith(".md")) continue;
      const renamed = renameTaxonomyInSource(
        new TextDecoder().decode(file.bytes),
        input.type,
        input.from,
        input.to,
        input.fromPath,
      );
      if (renamed.changed) {
        affected += 1;
        this.files.set(path, textFile(renamed.source));
      }
    }
    const commitSha = affected
      ? this.bump(`content: rename ${input.type} ${input.from} to ${input.to}`)
      : this.headSha;
    return { affected, commitSha, headSha: commitSha };
  }
}
