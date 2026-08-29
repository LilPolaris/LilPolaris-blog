import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PostTable } from "@/components/posts/post-table";
import { getRepository } from "@/lib/repository";

export const metadata = { title: "文章" };

export default async function PostsPage() {
  const repository = await getRepository();
  const posts = await repository.listPosts();
  return (
    <>
      <PageHeader
        actions={
          <Link className="button primary" href="/posts/new">
            <Plus size={16} />
            新建文章
          </Link>
        }
        description="搜索、筛选并管理正式文章与草稿。"
        title="文章"
      />
      <PostTable posts={posts} />
    </>
  );
}
