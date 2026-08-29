import { PageHeader } from "@/components/page-header";
import {
  TaxonomyManager,
  type TaxonomyManagerEntry,
} from "@/components/taxonomy/taxonomy-manager";
import { getRepository } from "@/lib/repository";

export const metadata = { title: "分类与标签" };

export default async function TaxonomyPage() {
  const repository = await getRepository();
  const posts = await repository.listPosts();
  const entriesByKey = new Map<string, TaxonomyManagerEntry>();
  for (const post of posts) {
    for (const tag of new Set(post.tags)) {
      const path = [tag];
      const key = `tag:${JSON.stringify(path)}`;
      const entry = entriesByKey.get(key) || {
        name: tag,
        path,
        key,
        type: "tag" as const,
        count: 0,
        posts: [],
      };
      entry.count += 1;
      entry.posts.push({ title: post.title, slug: post.slug, kind: post.kind });
      entriesByKey.set(key, entry);
    }
    const uniquePaths = new Map(
      post.categories.map((path) => [JSON.stringify(path), path]),
    );
    for (const path of uniquePaths.values()) {
      const key = `category:${JSON.stringify(path)}`;
      const entry = entriesByKey.get(key) || {
        name: path.at(-1) || "",
        path,
        key,
        type: "category" as const,
        count: 0,
        posts: [],
      };
      entry.count += 1;
      entry.posts.push({ title: post.title, slug: post.slug, kind: post.kind });
      entriesByKey.set(key, entry);
    }
  }
  const entries = [...entriesByKey.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.path.join("/").localeCompare(b.path.join("/"), "zh-CN"),
  );
  return (
    <>
      <PageHeader
        description="批量操作会先说明影响范围，并以单个 Git Commit 完成。"
        title="分类与标签"
      />
      <TaxonomyManager initialEntries={entries} />
    </>
  );
}
