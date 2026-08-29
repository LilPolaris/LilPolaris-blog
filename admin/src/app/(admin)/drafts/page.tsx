import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PostTable } from "@/components/posts/post-table";
import { getRepository } from "@/lib/repository";

export const metadata = { title: "草稿" };

export default async function DraftsPage() {
  const repository = await getRepository();
  const drafts = await repository.listPosts("draft");
  return (
    <>
      <PageHeader
        actions={
          <Link
            className="button primary"
            href="/posts/new?returnTo=%2Fdrafts"
          >
            <Plus size={16} />
            新建草稿
          </Link>
        }
        description="草稿最终存储在 Hexo 仓库的 source/_drafts 中。"
        title="草稿"
      />
      <PostTable fixedKind="draft" posts={drafts} />
    </>
  );
}
