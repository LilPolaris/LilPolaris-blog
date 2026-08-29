import type { MediaAsset, PostDocument } from "@/lib/types";

export function isMediaReferenced(
  document: Pick<PostDocument, "body" | "slug">,
  media: MediaAsset,
) {
  if (media.scope === "post") {
    return document.slug === media.postSlug && document.body.includes(media.name);
  }
  const publicPath = `/${media.path.replace(/^source\//, "")}`;
  return (
    document.body.includes(publicPath) || document.body.includes(media.path)
  );
}
