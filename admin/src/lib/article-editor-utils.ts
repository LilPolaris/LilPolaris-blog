import type { EditableFrontMatter, PendingMedia, PostKind } from "@/lib/types";

const SAFE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function slugFromTitle(title: string, fallback: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || fallback;
}

export function validateEditorSlug(
  value: string,
  occupiedSlugs: readonly string[],
  currentSlug?: string,
) {
  const slug = value.trim().replace(/\.md$/i, "");
  if (!slug) return "英文文件名不能为空。";
  if (!SAFE_SLUG.test(slug)) {
    return "只能使用英文字母、数字、点、短横线和下划线，且须以字母或数字开头。";
  }
  if (slug !== currentSlug && occupiedSlugs.includes(slug)) {
    return "这个英文文件名已被其他文章使用。";
  }
  return "";
}

export function kindForRegularSave(isDraft: boolean): PostKind {
  return isDraft ? "draft" : "post";
}

export function articleContentForAi(markdown: string, limit = 16_000) {
  const content = markdown.trim();
  if (content.length <= limit) return content;
  const tailLength = Math.min(4_000, Math.floor(limit / 4));
  const headLength = limit - tailLength - 24;
  return `${content.slice(0, headLength)}\n\n……正文中间已截断……\n\n${content.slice(-tailLength)}`;
}

export type RecoverableFrontMatter = Omit<
  EditableFrontMatter,
  "firstPublishedAt"
> &
  Partial<Pick<EditableFrontMatter, "firstPublishedAt">>;

export function migrateRecoveredFrontMatter(
  recovered: RecoverableFrontMatter,
  base?: EditableFrontMatter,
): EditableFrontMatter {
  return {
    ...recovered,
    firstPublishedAt:
      recovered.firstPublishedAt ??
      base?.firstPublishedAt ??
      (base && !base.draft ? recovered.date : ""),
  };
}

export function replaceUploadedMediaNames(
  markdown: string,
  submittedMedia: ReadonlyArray<Pick<PendingMedia, "id" | "name">>,
  mediaNamesById: Record<string, string>,
) {
  const uploadedNamesByReference = new Map(
    submittedMedia.flatMap((media) => {
      const uploadedName = mediaNamesById[media.id];
      return uploadedName ? [[media.name, uploadedName] as const] : [];
    }),
  );
  return markdown.replace(
    /(\{%\s*asset_img\s+)(["'])([^"'\r\n]+)\2/g,
    (tag, prefix: string, quote: string, referenceName: string) => {
      const uploadedName = uploadedNamesByReference.get(referenceName);
      return uploadedName
        ? `${prefix}${quote}${uploadedName}${quote}`
        : tag;
    },
  );
}
