import { Document, isMap, isScalar, parseDocument } from "yaml";
import { formatBlogTimestamp } from "@/lib/blog-time";
import { AppError } from "@/lib/errors";
import type {
  CategoryPath,
  EditableFrontMatter,
  PostKind,
} from "@/lib/types";

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface ParsedMarkdown {
  document: Document;
  rawFrontMatter: string;
  body: string;
  newline: "\n" | "\r\n";
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatBlogTimestamp(value);
  return String(value);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => stringValue(item))
      .filter(Boolean);
  }
  const single = stringValue(value);
  return single ? [single] : [];
}

export function normalizeCategories(value: unknown): CategoryPath[] {
  if (!Array.isArray(value)) {
    const single = stringValue(value);
    return single ? [[single]] : [];
  }
  if (value.some(Array.isArray)) {
    return value
      .map((entry) => (Array.isArray(entry) ? stringList(entry) : [stringValue(entry)]))
      .filter((entry) => entry.length && entry.every(Boolean));
  }
  const hierarchy = stringList(value);
  return hierarchy.length ? [hierarchy] : [];
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const match = source.match(FRONT_MATTER_PATTERN);
  if (!match) {
    throw new AppError(
      "VALIDATION",
      "文章必须以有效的 YAML Front Matter 开头和结束。",
      400,
    );
  }
  const rawFrontMatter = match[1];
  const document = parseDocument(rawFrontMatter, {
    keepSourceTokens: true,
    prettyErrors: true,
  });
  if (document.errors.length) {
    throw new AppError(
      "VALIDATION",
      `Front Matter 无法解析：${document.errors[0].message}`,
      400,
    );
  }
  if (!document.contents) {
    document.contents = document.createNode(
      {},
    ) as unknown as typeof document.contents;
  }
  if (!isMap(document.contents)) {
    throw new AppError("VALIDATION", "Front Matter 顶层必须是 YAML 对象。", 400);
  }
  return {
    document,
    rawFrontMatter,
    body: source.slice(match[0].length),
    newline: source.includes("\r\n") ? "\r\n" : "\n",
  };
}

export function editableFrontMatter(
  document: Document,
  slug: string,
  kind: PostKind,
  defaultLayout = "post",
): EditableFrontMatter {
  const value = (document.toJS() || {}) as Record<string, unknown>;
  return {
    title: stringValue(value.title),
    date: stringValue(value.date),
    firstPublishedAt:
      stringValue(value.first_published_at) ||
      (kind === "post" ? stringValue(value.date) : ""),
    updated: stringValue(value.updated),
    slug,
    tags: stringList(value.tags),
    categories: normalizeCategories(value.categories),
    excerpt: stringValue(value.excerpt ?? value.description),
    cover: stringValue(value.cover),
    draft: kind === "draft" || value.published === false,
    layout: stringValue(value.layout) || defaultLayout,
    permalink: stringValue(value.permalink),
  };
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function setPreservingStyle(document: Document, key: string, value: unknown) {
  if (!isMap(document.contents)) return;
  const existing = document.contents.get(key, true);
  if (isScalar(existing) && !Array.isArray(value)) {
    existing.value = value as string | number | boolean | null;
    return;
  }
  document.set(key, value);
}

function removeIfEmpty(document: Document, key: string, value: unknown) {
  const shouldRemove =
    value === "" ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0);
  if (shouldRemove) {
    if (isMap(document.contents) && document.contents.has(key)) {
      document.delete(key);
    }
    return true;
  }
  return false;
}

export function serializeMarkdown(
  originalSource: string | undefined,
  frontMatter: EditableFrontMatter,
  body: string,
  options?: {
    updateTimestamp?: boolean;
    sourceKind?: PostKind;
    resetPublication?: boolean;
    now?: Date;
    timeZone?: string;
  },
) {
  const parsed = originalSource
    ? parseMarkdown(originalSource)
    : parseMarkdown("---\ntitle:\ntags:\ncategories:\n---\n");
  const current = editableFrontMatter(
    parsed.document,
    frontMatter.slug,
    options?.sourceKind || (frontMatter.draft ? "draft" : "post"),
    frontMatter.layout,
  );
  const targetKind: PostKind = frontMatter.draft ? "draft" : "post";
  const sourceFirstPublishedAt = options?.resetPublication
    ? ""
    : current.firstPublishedAt ||
      (options?.sourceKind === "post" ? current.date : "");
  let firstPublishedAt = options?.resetPublication
    ? ""
    : frontMatter.firstPublishedAt || sourceFirstPublishedAt;
  const isFirstPublication = targetKind === "post" && !firstPublishedAt;
  const now = options?.now || new Date();
  if (isFirstPublication) {
    firstPublishedAt = formatBlogTimestamp(
      now,
      options?.timeZone,
    );
  }
  const normalizedFrontMatter: EditableFrontMatter = {
    ...frontMatter,
    date: firstPublishedAt,
    firstPublishedAt,
    updated:
      isFirstPublication || options?.resetPublication
        ? formatBlogTimestamp(now, options?.timeZone)
        : frontMatter.updated,
  };

  const excerptKey =
    isMap(parsed.document.contents) && parsed.document.contents.has("excerpt")
      ? "excerpt"
      : isMap(parsed.document.contents) &&
          parsed.document.contents.has("description")
        ? "description"
        : "excerpt";
  const fields: Array<[keyof EditableFrontMatter, string]> = [
    ["title", "title"],
    ["date", "date"],
    ["firstPublishedAt", "first_published_at"],
    ["updated", "updated"],
    ["tags", "tags"],
    ["categories", "categories"],
    ["excerpt", excerptKey],
    ["cover", "cover"],
    ["layout", "layout"],
    ["permalink", "permalink"],
  ];

  for (const [field, yamlKey] of fields) {
    let value = normalizedFrontMatter[field];
    if (field === "updated" && options?.updateTimestamp) {
      value = formatBlogTimestamp(
        now,
        options.timeZone,
      ) as never;
    }
    const shouldBackfillFirstPublishedAt =
      field === "firstPublishedAt" &&
      Boolean(value) &&
      isMap(parsed.document.contents) &&
      !parsed.document.contents.has(yamlKey);
    if (sameJson(current[field], value) && !shouldBackfillFirstPublishedAt) {
      continue;
    }
    if (removeIfEmpty(parsed.document, yamlKey, value)) continue;
    setPreservingStyle(parsed.document, yamlKey, value);
  }

  if (isMap(parsed.document.contents) && parsed.document.contents.has("published")) {
    setPreservingStyle(parsed.document, "published", !frontMatter.draft);
  }

  const yaml = parsed.document.toString({ lineWidth: 0 }).trimEnd();
  const normalizedBody = body.replace(/^\r?\n/, "");
  return `---${parsed.newline}${yaml}${parsed.newline}---${parsed.newline}${normalizedBody}`;
}

export function extractScalar(document: Document, key: string) {
  const node = isMap(document.contents) ? document.contents.get(key, true) : undefined;
  return isScalar(node) ? node.value : undefined;
}

export function renameTaxonomyInSource(
  source: string,
  type: "tag" | "category",
  from: string,
  to: string,
  fromPath?: string[],
) {
  const parsed = parseMarkdown(source);
  const key = type === "tag" ? "tags" : "categories";
  const value = (parsed.document.toJS() as Record<string, unknown>)[key];
  let changed = false;

  const matchesPath = (entry: unknown, path: string[]) =>
    Array.isArray(entry)
      ? entry.length === path.length &&
        entry.every((part, index) => String(part) === path[index])
      : path.length === 1 && String(entry) === path[0];

  const renameExactCategoryPath = (entry: unknown): unknown => {
    if (!fromPath?.length) return entry;
    if (!Array.isArray(entry)) {
      if (!matchesPath(entry, fromPath)) return entry;
      changed = true;
      return to;
    }
    if (!entry.some(Array.isArray)) {
      if (!matchesPath(entry, fromPath)) return entry;
      changed = true;
      return entry.map((part, index) =>
        index === entry.length - 1 ? to : part,
      );
    }
    return entry.map((path) => {
      if (!matchesPath(path, fromPath)) return path;
      changed = true;
      return Array.isArray(path)
        ? path.map((part, index) =>
            index === path.length - 1 ? to : part,
          )
        : to;
    });
  };

  const replace = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(replace);
    if (String(entry) === from) {
      changed = true;
      return to;
    }
    return entry;
  };

  const next =
    type === "category" && fromPath?.length
      ? renameExactCategoryPath(value)
      : replace(value);
  if (!changed) return { changed: false, source };
  parsed.document.set(key, next);
  const yaml = parsed.document.toString({ lineWidth: 0 }).trimEnd();
  return {
    changed: true,
    source: `---${parsed.newline}${yaml}${parsed.newline}---${parsed.newline}${parsed.body.replace(/^\r?\n/, "")}`,
  };
}
