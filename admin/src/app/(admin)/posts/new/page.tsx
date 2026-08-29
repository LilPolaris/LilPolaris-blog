import { ArticleEditor } from "@/components/editor/article-editor";
import { formatBlogTimestamp } from "@/lib/blog-time";
import { buildEditorContext } from "@/lib/editor-context";
import { safePostListReturnTo } from "@/lib/post-list-state";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import type { EditableFrontMatter } from "@/lib/types";

export const metadata = { title: "新建文章" };

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const [config, repository] = await Promise.all([
    getEffectiveRepositoryConfig(),
    getRepository(),
  ]);
  const editorContext = buildEditorContext(
    await repository.listPosts(),
    config,
  );
  const now = formatBlogTimestamp(new Date(), config.timezone);
  const defaults: EditableFrontMatter = {
    title: "",
    date: "",
    firstPublishedAt: "",
    updated: now,
    slug: "",
    tags: [],
    categories: config.defaultCategory ? [[config.defaultCategory]] : [],
    excerpt: "",
    cover: "",
    draft: true,
    layout: config.defaultLayout,
    permalink: "",
  };
  return (
    <div style={{ margin: "-18px -8px -30px" }}>
      <ArticleEditor
        blogTimezone={config.timezone}
        defaults={defaults}
        defaultEditorMode={config.editorDefaultMode}
        editorContext={editorContext}
        publicBlogUrl={config.publicBlogUrl}
        returnTo={safePostListReturnTo(returnTo)}
      />
    </div>
  );
}
