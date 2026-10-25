import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/editor/article-editor";
import { buildEditorContext } from "@/lib/editor-context";
import { AppError } from "@/lib/errors";
import { decodePostId } from "@/lib/path";
import { safePostListReturnTo } from "@/lib/post-list-state";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export const metadata = { title: "编辑文章" };

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const [repository, config] = await Promise.all([
    getRepository(),
    getEffectiveRepositoryConfig(),
  ]);
  // Both reads share the cached repository tree, so running them together
  // saves a full round of GitHub requests on every editor open.
  const [postResult, posts] = await Promise.all([
    repository.getPost(decodePostId(id)).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    repository.listPosts(),
  ]);
  if (!postResult.ok) {
    const error = postResult.error;
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const post = postResult.value;
  const editorContext = buildEditorContext(posts, config);
  return (
    <div className="editor-page">
      <ArticleEditor
        blogTimezone={config.timezone}
        defaults={post.frontMatter}
        defaultEditorMode={config.editorDefaultMode}
        editorContext={editorContext}
        initial={post}
        publicBlogUrl={config.publicBlogUrl}
        returnTo={safePostListReturnTo(returnTo)}
      />
    </div>
  );
}
