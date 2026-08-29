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
  let post;
  try {
    post = await repository.getPost(decodePostId(id));
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const editorContext = buildEditorContext(
    await repository.listPosts(),
    config,
  );
  return (
    <div style={{ margin: "-18px -8px -30px" }}>
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
