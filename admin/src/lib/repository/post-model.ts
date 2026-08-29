import { editableFrontMatter, parseMarkdown } from "@/lib/front-matter";
import { encodePostId } from "@/lib/path";
import type {
  PostDocument,
  PostKind,
  PostSummary,
  RepositoryConfig,
} from "@/lib/types";

export function slugFromPath(path: string) {
  return path.split("/").at(-1)?.replace(/\.md$/i, "") || "untitled";
}

export function kindFromPath(path: string, config: RepositoryConfig): PostKind {
  return path.startsWith(`${config.draftsPath}/`) ? "draft" : "post";
}

export function postFromSource(input: {
  path: string;
  sha: string;
  headSha: string;
  source: string;
  config: RepositoryConfig;
}): PostDocument {
  const kind = kindFromPath(input.path, input.config);
  const slug = slugFromPath(input.path);
  const parsed = parseMarkdown(input.source);
  const frontMatter = editableFrontMatter(
    parsed.document,
    slug,
    kind,
    input.config.defaultLayout,
  );
  const fallbackDate = "1970-01-01 00:00:00";
  return {
    id: encodePostId(input.path),
    path: input.path,
    kind,
    sha: input.sha,
    headSha: input.headSha,
    title: frontMatter.title || slug,
    slug,
    date: frontMatter.date || fallbackDate,
    updated: frontMatter.updated || frontMatter.date || fallbackDate,
    tags: frontMatter.tags,
    categories: frontMatter.categories,
    excerpt: frontMatter.excerpt,
    draft: kind === "draft",
    body: parsed.body,
    frontMatter,
    rawFrontMatter: parsed.rawFrontMatter,
  };
}

export function summaryFromDocument(document: PostDocument): PostSummary {
  return {
    id: document.id,
    path: document.path,
    kind: document.kind,
    sha: document.sha,
    title: document.title,
    slug: document.slug,
    date: document.date,
    updated: document.updated,
    tags: document.tags,
    categories: document.categories,
    excerpt: document.excerpt,
    draft: document.draft,
  };
}
