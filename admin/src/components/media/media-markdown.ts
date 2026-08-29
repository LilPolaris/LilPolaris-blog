import type { MediaAsset } from "@/lib/types";

export function defaultMediaAlt(item: MediaAsset) {
  return item.name.replace(/\.[^.]+$/, "");
}

export function mediaMarkdown(item: MediaAsset, alt = defaultMediaAlt(item)) {
  const cleanAlt = alt.trim() || defaultMediaAlt(item);
  return item.scope === "post"
    ? `{% asset_img "${item.name}" "${cleanAlt.replaceAll('"', "&quot;")}" %}`
    : `![${cleanAlt.replaceAll("]", "\\]")}](/${item.path.replace(/^source\//, "")})`;
}

export function isPotentiallyUnused(
  item: MediaAsset,
  knownPostSlugs?: ReadonlySet<string>,
) {
  if (item.scope === "global" || !knownPostSlugs) return undefined;
  return !item.postSlug || !knownPostSlugs.has(item.postSlug);
}

export function mediaReferenceLabel(
  item: MediaAsset,
  knownPostSlugs?: ReadonlySet<string>,
) {
  const unused = isPotentiallyUnused(item, knownPostSlugs);
  if (unused) return `疑似未使用：未找到文章 ${item.postSlug || "（未知）"}`;
  if (item.scope === "post") return `关联文章：${item.postSlug || "未知"}`;
  return "公共媒体：正文引用需手动确认";
}
