import { Octokit } from "@octokit/rest";
import { AppError } from "@/lib/errors";
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
  TaxonomyMutationResult,
  WorkflowRun,
} from "@/lib/types";

type TreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string | null;
  size?: number;
};

type RepositoryHead = {
  headSha: string;
  treeSha: string;
};

type RepositoryTree = RepositoryHead & {
  entries: TreeEntry[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

class AsyncTtlLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    if (cached) this.entries.delete(key);

    const value = Promise.resolve().then(load);
    const entry = { expiresAt: Date.now() + this.ttlMs, value };
    this.entries.set(key, entry);
    this.trim();
    void value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return value;
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  private trim() {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}

class TtlLruMap<T> {
  private readonly entries = new Map<
    string,
    { expiresAt: number; value: T }
  >();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      value,
    });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }

  deletePrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

const READ_TIMEOUT_MS = 10_000;
const READ_RETRY_DELAYS_MS = [100, 200];
const POST_BLOB_CONCURRENCY = 6;

const headCache = new AsyncTtlLruCache<RepositoryHead>(64, 5_000);
const treeCache = new AsyncTtlLruCache<RepositoryTree>(64, 60_000);
const blobTextCache = new AsyncTtlLruCache<string>(512, 5 * 60_000);
const approvedMediaVersions = new TtlLruMap<string>(4_096, 60_000);

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

function decodeBase64(content: string) {
  return Buffer.from(content.replace(/\n/g, ""), "base64");
}

function encodeBase64(content: Uint8Array | string) {
  return Buffer.from(content).toString("base64");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function retryableReadError(error: unknown) {
  const candidate = error as {
    status?: number;
    name?: string;
    code?: string;
    cause?: { code?: string };
  };
  if (candidate.name === "AbortError" || candidate.name === "TimeoutError") {
    return true;
  }
  if (
    candidate.code &&
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(
      candidate.code,
    )
  ) {
    return true;
  }
  if (
    candidate.cause?.code &&
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(
      candidate.cause.code,
    )
  ) {
    return true;
  }
  return (
    candidate.status === 408 ||
    candidate.status === 429 ||
    (typeof candidate.status === "number" && candidate.status >= 500)
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  map: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index], index);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

function mediaDownloadUrl(path: string, sha?: string) {
  const query = new URLSearchParams({ path });
  if (sha) query.set("sha", sha);
  return `/api/media/content?${query.toString()}`;
}

function imageContentType(path: string) {
  return IMAGE_TYPES[path.split(".").at(-1)?.toLowerCase() || ""] || "application/octet-stream";
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function validateImageBytes(
  bytes: Uint8Array,
  name: string,
  reportedContentType: string,
) {
  const expected = imageContentType(name);
  if (
    reportedContentType &&
    reportedContentType !== expected &&
    reportedContentType !== "application/octet-stream"
  ) {
    throw new AppError(
      "UPLOAD_INVALID",
      "文件扩展名与浏览器报告的图片类型不一致。",
      400,
    );
  }
  const valid =
    (expected === "image/jpeg" &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (expected === "image/png" &&
      bytes[0] === 0x89 &&
      ascii(bytes, 1, 3) === "PNG") ||
    (expected === "image/gif" &&
      (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) ||
    (expected === "image/webp" &&
      ascii(bytes, 0, 4) === "RIFF" &&
      ascii(bytes, 8, 4) === "WEBP") ||
    (expected === "image/avif" &&
      ascii(bytes, 4, 4) === "ftyp" &&
      ["avif", "avis"].includes(ascii(bytes, 8, 4)));
  if (!valid) {
    throw new AppError(
      "UPLOAD_INVALID",
      "文件内容不是有效的受支持图片，上传已拒绝。",
      400,
    );
  }
}

function cleanFileName(name: string) {
  const normalized = name
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^\.+/, "");
  const extension = normalized.split(".").at(-1)?.toLowerCase() || "";
  if (!normalized || !IMAGE_TYPES[extension]) {
    throw new AppError(
      "UPLOAD_INVALID",
      "仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片。",
      400,
    );
  }
  return normalized;
}

export class GitHubRepositoryAdapter implements RepositoryAdapter {
  private readonly octokit: Octokit;

  constructor(
    private readonly config: RepositoryConfig,
    token: string,
  ) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: "lilpolaris-blog-admin/1.0",
    });
  }

  private repositoryCacheKey(suffix: string) {
    return `${this.config.owner}/${this.config.repo}/${suffix}`;
  }

  private headCacheKey() {
    return this.repositoryCacheKey(`heads/${this.config.branch}`);
  }

  private mediaApprovalPrefix() {
    return this.repositoryCacheKey(`media/${this.config.branch}/`);
  }

  private mediaApprovalKey(path: string) {
    return `${this.mediaApprovalPrefix()}${path}`;
  }

  private approveMedia(path: string, sha: string) {
    approvedMediaVersions.set(this.mediaApprovalKey(path), sha);
  }

  private isApprovedMedia(path: string, sha: string) {
    return approvedMediaVersions.get(this.mediaApprovalKey(path)) === sha;
  }

  private isAllowedMediaPath(path: string) {
    const extension = path.split(".").at(-1)?.toLowerCase() || "";
    if (!IMAGE_TYPES[extension]) return false;
    if (path.startsWith(`${this.config.imagesPath}/`)) return true;
    return [this.config.postsPath, this.config.draftsPath].some((root) => {
      if (!path.startsWith(`${root}/`)) return false;
      return path.slice(root.length + 1).split("/").length >= 2;
    });
  }

  private invalidateHeadCache() {
    headCache.delete(this.headCacheKey());
    approvedMediaVersions.deletePrefix(this.mediaApprovalPrefix());
  }

  private async readRequest<T>(
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await request(AbortSignal.timeout(READ_TIMEOUT_MS));
      } catch (error) {
        lastError = error;
        if (
          attempt >= READ_RETRY_DELAYS_MS.length ||
          !retryableReadError(error)
        ) {
          throw error;
        }
        await delay(READ_RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastError;
  }

  private args() {
    return {
      owner: this.config.owner,
      repo: this.config.repo,
    };
  }

  private commitMessage(action: string, slug: string) {
    return this.config.commitTemplate
      .replaceAll("{action}", action)
      .replaceAll("{slug}", slug);
  }

  private head() {
    return headCache.getOrLoad(this.headCacheKey(), async () => {
      const ref = await this.readRequest((signal) =>
        this.octokit.rest.git.getRef({
          ...this.args(),
          ref: `heads/${this.config.branch}`,
          request: { signal },
        }),
      );
      const commit = await this.readRequest((signal) =>
        this.octokit.rest.git.getCommit({
          ...this.args(),
          commit_sha: ref.data.object.sha,
          request: { signal },
        }),
      );
      return {
        headSha: ref.data.object.sha,
        treeSha: commit.data.tree.sha,
      };
    });
  }

  private async tree() {
    const head = await this.head();
    return treeCache.getOrLoad(
      this.repositoryCacheKey(`trees/${head.headSha}`),
      async () => {
        const response = await this.readRequest((signal) =>
          this.octokit.rest.git.getTree({
            ...this.args(),
            tree_sha: head.treeSha,
            recursive: "true",
            request: { signal },
          }),
        );
        if (response.data.truncated) {
          throw new AppError(
            "GITHUB_ERROR",
            "仓库文件树过大，GitHub 返回了截断结果。",
            502,
          );
        }
        return {
          ...head,
          entries: response.data.tree as TreeEntry[],
        };
      },
    );
  }

  private blobText(sha: string) {
    return blobTextCache.getOrLoad(
      this.repositoryCacheKey(`blobs/${sha}`),
      async () => {
        const response = await this.readRequest((signal) =>
          this.octokit.rest.git.getBlob({
            ...this.args(),
            file_sha: sha,
            request: { signal },
          }),
        );
        return decodeBase64(response.data.content).toString("utf8");
      },
    );
  }

  private async commitTreeChanges(
    message: string,
    baseHeadSha: string,
    baseTreeSha: string,
    changes: Array<{
      path: string;
      sha?: string | null;
      content?: string;
    }>,
  ) {
    const tree = changes.map((entry) => ({
      path: normalizeRepoPath(entry.path),
      mode: "100644" as const,
      type: "blob" as const,
      ...(entry.content !== undefined
        ? { content: entry.content }
        : { sha: entry.sha ?? null }),
    }));
    const newTree = await this.octokit.rest.git.createTree({
      ...this.args(),
      base_tree: baseTreeSha,
      tree,
    });
    const commit = await this.octokit.rest.git.createCommit({
      ...this.args(),
      message,
      tree: newTree.data.sha,
      parents: [baseHeadSha],
    });
    await this.octokit.rest.git.updateRef({
      ...this.args(),
      ref: `heads/${this.config.branch}`,
      sha: commit.data.sha,
      force: false,
    });
    this.invalidateHeadCache();
    return {
      commitSha: commit.data.sha,
      headSha: commit.data.sha,
      tree: newTree.data.tree as TreeEntry[],
    };
  }

  async checkConnection() {
    await Promise.all([
      this.readRequest((signal) =>
        this.octokit.rest.repos.get({
          ...this.args(),
          request: { signal },
        }),
      ),
      this.readRequest((signal) =>
        this.octokit.rest.repos.getBranch({
          ...this.args(),
          branch: this.config.branch,
          request: { signal },
        }),
      ),
    ]);
    return true;
  }

  async listPosts(kind?: PostKind): Promise<PostSummary[]> {
    const { headSha, entries } = await this.tree();
    const directories =
      kind === "post"
        ? [this.config.postsPath]
        : kind === "draft"
          ? [this.config.draftsPath]
          : [this.config.postsPath, this.config.draftsPath];
    const files = entries.filter(
      (entry) =>
        entry.type === "blob" &&
        Boolean(entry.path?.endsWith(".md")) &&
        Boolean(entry.sha) &&
        directories.some((directory) =>
          entry.path?.startsWith(`${directory}/`),
        ),
    );
    const documents = await mapWithConcurrency(
      files,
      POST_BLOB_CONCURRENCY,
      async (entry) =>
        postFromSource({
          path: entry.path!,
          sha: entry.sha!,
          headSha,
          source: await this.blobText(entry.sha!),
          config: this.config,
        }),
    );
    return documents
      .map(summaryFromDocument)
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async getPost(path: string): Promise<PostDocument> {
    const normalizedPath = normalizeRepoPath(path);
    const tree = await this.tree();
    const entry = tree.entries.find(
      (item) => item.path === normalizedPath && item.type === "blob",
    );
    if (!entry?.sha) {
      throw new AppError("NOT_FOUND", "文章文件不存在。", 404);
    }
    return postFromSource({
      path: normalizedPath,
      sha: entry.sha,
      headSha: tree.headSha,
      source: await this.blobText(entry.sha),
      config: this.config,
    });
  }

  async savePost(input: PostMutationInput): Promise<MutationResult> {
    const slug = validateSlug(input.slug);
    if (!input.frontMatter.title.trim()) {
      throw new AppError("VALIDATION", "文章标题不能为空。", 400);
    }
    const targetPath = postPath(this.config, input.kind, slug);
    const currentPath = input.currentPath
      ? normalizeRepoPath(input.currentPath)
      : undefined;
    const tree = await this.tree();
    const currentEntry = currentPath
      ? tree.entries.find((entry) => entry.path === currentPath)
      : undefined;
    if (currentPath && (!currentEntry?.sha || currentEntry.type !== "blob")) {
      throw new AppError("NOT_FOUND", "原文章已经不存在。", 404);
    }
    if (
      currentEntry &&
      input.expectedSha &&
      currentEntry.sha !== input.expectedSha &&
      !input.force
    ) {
      const remoteSource = await this.blobText(currentEntry.sha!);
      throw new AppError(
        "CONFLICT",
        "远程文章在你打开后已被修改。",
        409,
        { remoteSha: currentEntry.sha, remoteSource },
      );
    }
    const collision = tree.entries.find(
      (entry) => entry.path === targetPath && entry.path !== currentPath,
    );
    if (collision) {
      throw new AppError("CONFLICT", `目标文件 ${targetPath} 已存在。`, 409);
    }

    const originalSource = currentEntry
      ? await this.blobText(currentEntry.sha!)
      : undefined;
    const content = serializeMarkdown(
      originalSource,
      { ...input.frontMatter, slug, draft: input.kind === "draft" },
      input.body,
      {
        updateTimestamp: Boolean(currentEntry),
        sourceKind: currentPath
          ? kindFromPath(currentPath, this.config)
          : undefined,
        timeZone: this.config.timezone,
      },
    );
    const action = currentPath
      ? input.kind === "draft"
        ? "save draft"
        : "update"
      : input.kind === "draft"
        ? "create draft"
        : "create";
    const message = this.commitMessage(action, slug);

    if (!currentPath || currentPath === targetPath) {
      const response = await this.octokit.rest.repos.createOrUpdateFileContents({
        ...this.args(),
        path: targetPath,
        branch: this.config.branch,
        message,
        content: encodeBase64(content),
        ...(currentEntry ? { sha: currentEntry.sha! } : {}),
      });
      this.invalidateHeadCache();
      return {
        path: targetPath,
        sha: response.data.content?.sha || "",
        headSha: response.data.commit.sha || "",
        commitSha: response.data.commit.sha || "",
        message,
      };
    }

    const oldAssetDirectory = assetDirectoryFromPostPath(currentPath);
    const newAssetDirectory = assetDirectoryFromPostPath(targetPath);
    const assetEntries = tree.entries.filter(
      (entry) =>
        entry.type === "blob" &&
        entry.sha &&
        entry.path?.startsWith(`${oldAssetDirectory}/`),
    );
    const changes: Array<{
      path: string;
      sha?: string | null;
      content?: string;
    }> = [
      { path: currentPath, sha: null },
      { path: targetPath, content },
    ];
    for (const asset of assetEntries) {
      const relative = asset.path!.slice(oldAssetDirectory.length + 1);
      changes.push(
        { path: asset.path!, sha: null },
        { path: `${newAssetDirectory}/${relative}`, sha: asset.sha! },
      );
    }
    const committed = await this.commitTreeChanges(
      input.kind === "draft"
        ? `content: move post ${slug} to drafts`
        : `content: publish post ${slug}`,
      tree.headSha,
      tree.treeSha,
      changes,
    );
    const newEntry = committed.tree.find((entry) => entry.path === targetPath);
    return {
      path: targetPath,
      sha: newEntry?.sha || "",
      headSha: committed.headSha,
      commitSha: committed.commitSha,
      message,
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
        mediaNameMap: {},
      };
    }

    const slug = validateSlug(input.slug);
    if (!input.frontMatter.title.trim()) {
      throw new AppError("VALIDATION", "文章标题不能为空。", 400);
    }
    const totalBytes = input.media.reduce(
      (total, media) => total + media.bytes.byteLength,
      0,
    );
    if (totalBytes > 32 * 1024 * 1024) {
      throw new AppError(
        "UPLOAD_INVALID",
        "一篇文章待上传图片总量不能超过 32 MiB。",
        413,
      );
    }
    const singleLimit = Math.min(this.config.uploadLimitMb, 8) * 1024 * 1024;
    for (const media of input.media) {
      if (media.bytes.byteLength > singleLimit) {
        throw new AppError(
          "UPLOAD_INVALID",
          `单张图片不能超过 ${Math.min(this.config.uploadLimitMb, 8)} MiB。`,
          413,
        );
      }
      validateImageBytes(media.bytes, cleanFileName(media.name), media.contentType);
    }

    const targetPath = postPath(this.config, input.kind, slug);
    const currentPath = input.currentPath
      ? normalizeRepoPath(input.currentPath)
      : undefined;
    const tree = await this.tree();
    const currentEntry = currentPath
      ? tree.entries.find((entry) => entry.path === currentPath)
      : undefined;
    if (currentPath && (!currentEntry?.sha || currentEntry.type !== "blob")) {
      throw new AppError("NOT_FOUND", "原文章已经不存在。", 404);
    }
    if (
      currentEntry &&
      input.expectedSha &&
      currentEntry.sha !== input.expectedSha &&
      !input.force
    ) {
      throw new AppError(
        "CONFLICT",
        "远程文章在你打开后已被修改。",
        409,
        {
          remoteSha: currentEntry.sha,
          remoteSource: await this.blobText(currentEntry.sha!),
        },
      );
    }
    if (
      tree.entries.some(
        (entry) => entry.path === targetPath && entry.path !== currentPath,
      )
    ) {
      throw new AppError("CONFLICT", `目标文件 ${targetPath} 已存在。`, 409);
    }

    const oldAssetDirectory = currentPath
      ? assetDirectoryFromPostPath(currentPath)
      : undefined;
    const assetDirectory = assetDirectoryFromPostPath(targetPath);
    const existingAssets = tree.entries.filter(
      (entry) =>
        entry.type === "blob" &&
        entry.sha &&
        oldAssetDirectory &&
        entry.path?.startsWith(`${oldAssetDirectory}/`),
    );
    const reservedNames = new Set(
      existingAssets.map((entry) => entry.path!.split("/").at(-1)!),
    );
    tree.entries
      .filter(
        (entry) =>
          entry.type === "blob" &&
          entry.path?.startsWith(`${assetDirectory}/`) &&
          !entry.path?.startsWith(`${oldAssetDirectory}/`),
      )
      .forEach((entry) => reservedNames.add(entry.path!.split("/").at(-1)!));

    const mediaNameMap: Record<string, string> = {};
    const stagedMedia: Array<{
      source: (typeof input.media)[number];
      name: string;
      path: string;
      sha: string;
    }> = [];
    let finalBody = input.body;
    for (const media of input.media) {
      const cleanName = cleanFileName(media.name);
      const dot = cleanName.lastIndexOf(".");
      const stem = cleanName.slice(0, dot);
      const extension = cleanName.slice(dot);
      let name = cleanName;
      let suffix = 2;
      while (reservedNames.has(name)) {
        name = `${stem}-${suffix}${extension}`;
        suffix += 1;
      }
      reservedNames.add(name);
      mediaNameMap[media.id] = name;
      if (name !== media.name) {
        finalBody = finalBody.replaceAll(
          `{% asset_img "${media.name}"`,
          `{% asset_img "${name}"`,
        );
      }
      const blob = await this.octokit.rest.git.createBlob({
        ...this.args(),
        content: encodeBase64(media.bytes),
        encoding: "base64",
      });
      stagedMedia.push({
        source: media,
        name,
        path: `${assetDirectory}/${name}`,
        sha: blob.data.sha,
      });
    }

    const originalSource = currentEntry
      ? await this.blobText(currentEntry.sha!)
      : undefined;
    const content = serializeMarkdown(
      originalSource,
      { ...input.frontMatter, slug, draft: input.kind === "draft" },
      finalBody,
      {
        updateTimestamp: Boolean(currentEntry),
        sourceKind: currentPath
          ? kindFromPath(currentPath, this.config)
          : undefined,
        timeZone: this.config.timezone,
      },
    );
    const markdownBlob = await this.octokit.rest.git.createBlob({
      ...this.args(),
      content: encodeBase64(content),
      encoding: "base64",
    });
    const changes: Array<{ path: string; sha?: string | null }> = [];
    if (currentPath && currentPath !== targetPath) {
      changes.push({ path: currentPath, sha: null });
      for (const asset of existingAssets) {
        const relative = asset.path!.slice(oldAssetDirectory!.length + 1);
        changes.push(
          { path: asset.path!, sha: null },
          { path: `${assetDirectory}/${relative}`, sha: asset.sha! },
        );
      }
    }
    changes.push(
      { path: targetPath, sha: markdownBlob.data.sha },
      ...stagedMedia.map((media) => ({ path: media.path, sha: media.sha })),
    );
    const message = this.commitMessage(
      input.kind === "draft" ? "save draft bundle" : "publish bundle",
      slug,
    );
    const committed = await this.commitTreeChanges(
      message,
      tree.headSha,
      tree.treeSha,
      changes,
    );
    for (const media of stagedMedia) {
      this.approveMedia(media.path, media.sha);
    }
    return {
      path: targetPath,
      sha: markdownBlob.data.sha,
      headSha: committed.headSha,
      commitSha: committed.commitSha,
      message,
      body: finalBody,
      mediaNameMap,
      uploadedMedia: stagedMedia.map((media) => ({
        id: Buffer.from(media.path, "utf8").toString("base64url"),
        path: media.path,
        name: media.name,
        sha: media.sha,
        size: media.source.bytes.byteLength,
        scope: "post",
        postSlug: slug,
        uploadedAt: new Date().toISOString(),
        downloadUrl: mediaDownloadUrl(media.path, media.sha),
      })),
    };
  }

  async deletePost(
    path: string,
    expectedSha: string,
    deleteAssets: boolean,
  ): Promise<MutationResult> {
    const normalizedPath = normalizeRepoPath(path);
    const slug = normalizedPath.split("/").at(-1)!.replace(/\.md$/i, "");
    const tree = await this.tree();
    const entry = tree.entries.find((item) => item.path === normalizedPath);
    if (!entry?.sha) throw new AppError("NOT_FOUND", "文章不存在。", 404);
    if (entry.sha !== expectedSha) {
      throw new AppError("CONFLICT", "远程文章已更新，无法安全删除。", 409);
    }
    const message = `content: delete post ${slug}`;
    if (!deleteAssets) {
      const response = await this.octokit.rest.repos.deleteFile({
        ...this.args(),
        path: normalizedPath,
        branch: this.config.branch,
        message,
        sha: entry.sha,
      });
      this.invalidateHeadCache();
      return {
        path: normalizedPath,
        sha: "",
        headSha: response.data.commit.sha || "",
        commitSha: response.data.commit.sha || "",
        message,
      };
    }
    const assetDirectory = assetDirectoryFromPostPath(normalizedPath);
    const changes = tree.entries
      .filter(
        (item) =>
          item.path === normalizedPath ||
          item.path?.startsWith(`${assetDirectory}/`),
      )
      .map((item) => ({ path: item.path!, sha: null }));
    const committed = await this.commitTreeChanges(
      message,
      tree.headSha,
      tree.treeSha,
      changes,
    );
    return {
      path: normalizedPath,
      sha: "",
      headSha: committed.headSha,
      commitSha: committed.commitSha,
      message,
    };
  }

  async duplicatePost(
    path: string,
    expectedSha: string,
    targetSlug: string,
  ): Promise<MutationResult> {
    const normalizedPath = normalizeRepoPath(path);
    const slug = validateSlug(targetSlug);
    const tree = await this.tree();
    const source = tree.entries.find((item) => item.path === normalizedPath);
    if (!source?.sha) throw new AppError("NOT_FOUND", "原文章不存在。", 404);
    if (source.sha !== expectedSha) {
      throw new AppError("CONFLICT", "远程文章已更新，请重新加载。", 409);
    }
    const kind = kindFromPath(normalizedPath, this.config);
    const targetPath = postPath(this.config, kind, slug);
    if (tree.entries.some((entry) => entry.path === targetPath)) {
      throw new AppError("CONFLICT", "目标 slug 已存在。", 409);
    }
    const sourceText = await this.blobText(source.sha);
    const sourceDocument = postFromSource({
      path: normalizedPath,
      sha: source.sha,
      headSha: tree.headSha,
      source: sourceText,
      config: this.config,
    });
    const duplicatedText = serializeMarkdown(
      sourceText,
      {
        ...sourceDocument.frontMatter,
        slug,
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
    );
    const oldAssetDirectory = assetDirectoryFromPostPath(normalizedPath);
    const newAssetDirectory = assetDirectoryFromPostPath(targetPath);
    const changes: Array<{
      path: string;
      sha?: string;
      content?: string;
    }> = [
      { path: targetPath, content: duplicatedText },
    ];
    for (const asset of tree.entries.filter(
      (entry) =>
        entry.type === "blob" &&
        entry.sha &&
        entry.path?.startsWith(`${oldAssetDirectory}/`),
    )) {
      changes.push({
        path: `${newAssetDirectory}/${asset.path!.slice(oldAssetDirectory.length + 1)}`,
        sha: asset.sha!,
      });
    }
    const message = `content: duplicate post ${slug}`;
    const committed = await this.commitTreeChanges(
      message,
      tree.headSha,
      tree.treeSha,
      changes,
    );
    const newEntry = committed.tree.find((entry) => entry.path === targetPath);
    return {
      path: targetPath,
      sha: newEntry?.sha || "",
      headSha: committed.headSha,
      commitSha: committed.commitSha,
      message,
    };
  }

  async listMedia(): Promise<MediaAsset[]> {
    const tree = await this.tree();
    return tree.entries
      .filter((entry) => {
        if (entry.type !== "blob" || !entry.path || !entry.sha) return false;
        return this.isAllowedMediaPath(entry.path);
      })
      .map((entry) => {
        this.approveMedia(entry.path!, entry.sha!);
        const inGlobal = entry.path!.startsWith(`${this.config.imagesPath}/`);
        const parent = entry.path!.split("/").slice(0, -1).join("/");
        return {
          id: Buffer.from(entry.path!, "utf8").toString("base64url"),
          path: entry.path!,
          name: entry.path!.split("/").at(-1)!,
          sha: entry.sha!,
          size: entry.size || 0,
          scope: inGlobal ? ("global" as const) : ("post" as const),
          postSlug: inGlobal ? undefined : parent.split("/").at(-1),
          downloadUrl: mediaDownloadUrl(entry.path!, entry.sha!),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async getMedia(path: string, sha?: string) {
    const normalizedPath = normalizeRepoPath(path);
    if (!this.isAllowedMediaPath(normalizedPath)) {
      throw new AppError("NOT_FOUND", "媒体文件不存在。", 404);
    }
    if (sha && !/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(sha)) {
      throw new AppError("VALIDATION", "媒体版本标识不合法。", 400);
    }
    let blobSha = sha;
    if (!blobSha || !this.isApprovedMedia(normalizedPath, blobSha)) {
      const tree = await this.tree();
      const entry = tree.entries.find(
        (item) => item.path === normalizedPath && item.type === "blob",
      );
      if (!entry?.sha || (blobSha && entry.sha !== blobSha)) {
        throw new AppError("NOT_FOUND", "媒体文件不存在。", 404);
      }
      blobSha = entry.sha;
      this.approveMedia(normalizedPath, blobSha);
    }
    const response = await this.readRequest((signal) =>
      this.octokit.rest.git.getBlob({
        ...this.args(),
        file_sha: blobSha,
        request: { signal },
      }),
    );
    return {
      bytes: new Uint8Array(decodeBase64(response.data.content)),
      contentType: imageContentType(normalizedPath),
      etag: blobSha,
    };
  }

  async uploadMedia(input: {
    bytes: Uint8Array;
    name: string;
    contentType: string;
    postPath?: string;
  }): Promise<MediaAsset> {
    const maxBytes = this.config.uploadLimitMb * 1024 * 1024;
    if (input.bytes.byteLength > maxBytes) {
      throw new AppError(
        "UPLOAD_INVALID",
        `图片不能超过 ${this.config.uploadLimitMb} MiB。`,
        413,
      );
    }
    const cleanName = cleanFileName(input.name);
    validateImageBytes(input.bytes, cleanName, input.contentType);
    const directory = input.postPath
      ? assetDirectoryFromPostPath(input.postPath)
      : this.config.imagesPath;
    const tree = await this.tree();
    const extension = cleanName.includes(".")
      ? `.${cleanName.split(".").at(-1)}`
      : "";
    const stem = cleanName.slice(0, -extension.length);
    let name = cleanName;
    let suffix = 2;
    while (tree.entries.some((entry) => entry.path === `${directory}/${name}`)) {
      name = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    const path = `${directory}/${name}`;
    const response = await this.octokit.rest.repos.createOrUpdateFileContents({
      ...this.args(),
      path,
      branch: this.config.branch,
      message: `media: upload ${name}`,
      content: encodeBase64(input.bytes),
    });
    this.invalidateHeadCache();
    const sha = response.data.content?.sha || "";
    if (sha) this.approveMedia(path, sha);
    return {
      id: Buffer.from(path, "utf8").toString("base64url"),
      path,
      name,
      sha,
      size: input.bytes.byteLength,
      scope: input.postPath ? "post" : "global",
      postSlug: input.postPath
        ? assetDirectoryFromPostPath(input.postPath).split("/").at(-1)
        : undefined,
      uploadedAt: new Date().toISOString(),
      downloadUrl: mediaDownloadUrl(path, sha || undefined),
    };
  }

  async deleteMedia(path: string, expectedSha: string) {
    const normalizedPath = normalizeRepoPath(path);
    const message = `media: delete ${normalizedPath.split("/").at(-1)}`;
    const response = await this.octokit.rest.repos.deleteFile({
      ...this.args(),
      path: normalizedPath,
      branch: this.config.branch,
      message,
      sha: expectedSha,
    });
    this.invalidateHeadCache();
    return {
      path: normalizedPath,
      sha: "",
      headSha: response.data.commit.sha || "",
      commitSha: response.data.commit.sha || "",
      message,
    };
  }

  async listWorkflowRuns(): Promise<WorkflowRun[]> {
    if (!this.config.workflowId) return [];
    const response = await this.readRequest((signal) =>
      this.octokit.rest.actions.listWorkflowRuns({
        ...this.args(),
        workflow_id: this.config.workflowId,
        branch: this.config.branch,
        per_page: 20,
        request: { signal },
      }),
    );
    return response.data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name || this.config.workflowId,
      branch: run.head_branch || "",
      event: run.event,
      status: run.status || "unknown",
      conclusion: run.conclusion || null,
      title: run.display_title || run.head_commit?.message || "",
      commitSha: run.head_sha,
      startedAt: run.run_started_at || run.created_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
    }));
  }

  async dispatchWorkflow() {
    if (!this.config.workflowId) {
      throw new AppError(
        "WORKFLOW_UNAVAILABLE",
        "尚未配置可手动触发的 GitHub Actions Workflow。",
        400,
      );
    }
    await this.octokit.rest.actions.createWorkflowDispatch({
      ...this.args(),
      workflow_id: this.config.workflowId,
      ref: this.config.branch,
    });
  }

  async renameTaxonomy(
    input: RenameTaxonomyInput,
  ): Promise<TaxonomyMutationResult> {
    const from = input.from.trim();
    const to = input.to.trim();
    if (!from || !to || from === to) {
      throw new AppError("VALIDATION", "请输入不同的新旧名称。", 400);
    }
    const tree = await this.tree();
    if (input.expectedHeadSha && input.expectedHeadSha !== tree.headSha) {
      throw new AppError(
        "CONFLICT",
        "仓库在确认后发生了变化，请重新检查受影响文章。",
        409,
      );
    }
    const roots = [this.config.postsPath, this.config.draftsPath];
    const files = tree.entries.filter(
      (entry) =>
        entry.type === "blob" &&
        entry.sha &&
        entry.path?.endsWith(".md") &&
        roots.some((root) => entry.path?.startsWith(`${root}/`)),
    );
    const changes: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      const source = await this.blobText(file.sha!);
      const renamed = renameTaxonomyInSource(
        source,
        input.type,
        from,
        to,
        input.fromPath,
      );
      if (renamed.changed) {
        changes.push({ path: file.path!, content: renamed.source });
      }
    }
    if (!changes.length) {
      return { affected: 0, commitSha: tree.headSha, headSha: tree.headSha };
    }
    const committed = await this.commitTreeChanges(
      `content: rename ${input.type} ${from} to ${to}`,
      tree.headSha,
      tree.treeSha,
      changes,
    );
    return {
      affected: changes.length,
      commitSha: committed.commitSha,
      headSha: committed.headSha,
    };
  }
}
