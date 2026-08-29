import { AppError } from "@/lib/errors";
import type { PostKind, RepositoryConfig } from "@/lib/types";

const SAFE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function normalizeRepoPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new AppError("VALIDATION", "仓库路径不合法。", 400);
  }
  return normalized;
}

export function validateSlug(value: string): string {
  const slug = value.trim().replace(/\.md$/i, "");
  if (!SAFE_SLUG.test(slug)) {
    throw new AppError(
      "VALIDATION",
      "Slug 只能包含英文字母、数字、点、短横线和下划线，且必须以字母或数字开头。",
      400,
    );
  }
  return slug;
}

export function postDirectory(config: RepositoryConfig, kind: PostKind) {
  return kind === "draft" ? config.draftsPath : config.postsPath;
}

export function postPath(
  config: RepositoryConfig,
  kind: PostKind,
  slug: string,
) {
  return `${normalizeRepoPath(postDirectory(config, kind))}/${validateSlug(slug)}.md`;
}

export function assetDirectoryFromPostPath(path: string) {
  return normalizeRepoPath(path).replace(/\.md$/i, "");
}

export function encodePostId(path: string) {
  return Buffer.from(normalizeRepoPath(path), "utf8").toString("base64url");
}

export function decodePostId(id: string) {
  try {
    return normalizeRepoPath(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    throw new AppError("VALIDATION", "文章标识无效。", 400);
  }
}
