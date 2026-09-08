"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileClock,
  FileText,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import {
  DEFAULT_POST_LIST_STATE,
  parsePostListState,
  postListUrl,
  type PostListState,
} from "@/lib/post-list-state";
import type { PostDocument, PostSummary } from "@/lib/types";

const PAGE_SIZE = 10;

async function readError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return payload?.error?.message || "操作失败，请稍后重试。";
}

export function PostTable({
  posts,
  fixedKind,
}: {
  posts: PostSummary[];
  fixedKind?: "post" | "draft";
}) {
  const router = useRouter();
  const basePath = fixedKind === "draft" ? "/drafts" : "/posts";
  const [listState, setListState] = useState<PostListState>(() => ({
    ...DEFAULT_POST_LIST_STATE,
    status: fixedKind || "all",
  }));
  const [urlReady, setUrlReady] = useState(false);
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const { category, page, query, sort, status: kind, tag } = listState;
  const deferredQuery = useDeferredValue(query);
  const hasFilters = Boolean(
    query || category || tag || (!fixedKind && kind !== "all"),
  );
  const counts = useMemo(
    () => ({
      all: posts.length,
      post: posts.filter((post) => post.kind === "post").length,
      draft: posts.filter((post) => post.kind === "draft").length,
    }),
    [posts],
  );

  useEffect(() => {
    const restoreFromUrl = () => {
      setListState(parsePostListState(window.location.search, fixedKind));
    };
    const timer = window.setTimeout(() => {
      restoreFromUrl();
      setUrlReady(true);
    }, 0);
    window.addEventListener("popstate", restoreFromUrl);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", restoreFromUrl);
    };
  }, [fixedKind]);

  useEffect(() => {
    if (!urlReady) return;
    const nextUrl = postListUrl(basePath, listState, fixedKind);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [basePath, fixedKind, listState, urlReady]);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          posts.flatMap((post) =>
            post.categories.map((path) => path.join(" > ")),
          ),
        ),
      ].sort(),
    [posts],
  );
  const tags = useMemo(
    () => [...new Set(posts.flatMap((post) => post.tags))].sort(),
    [posts],
  );
  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return posts
      .filter((post) => {
        if (kind !== "all" && post.kind !== kind) return false;
        if (
          normalized &&
          !`${post.title} ${post.slug} ${post.tags.join(" ")} ${post.categories.flat().join(" ")}`
            .toLowerCase()
            .includes(normalized)
        ) {
          return false;
        }
        if (
          category &&
          !post.categories.some((path) => path.join(" > ") === category)
        ) {
          return false;
        }
        if (tag && !post.tags.includes(tag)) return false;
        return true;
      })
      .sort((a, b) => b[sort].localeCompare(a[sort]));
  }, [category, kind, posts, deferredQuery, sort, tag]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function updateFilter(patch: Partial<PostListState>) {
    setListState((current) => ({ ...current, ...patch, page: 1 }));
  }

  function clearFilters() {
    setListState((current) => ({
      ...DEFAULT_POST_LIST_STATE,
      sort: current.sort,
      status: fixedKind || "all",
    }));
  }

  async function transition(post: PostSummary) {
    if (busyRef.current) return;
    if (
      post.kind === "post" &&
      !window.confirm(`“${post.title}”将从公开站点下线并移入草稿。确定继续吗？`)
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(post.path);
    setMessage("");
    try {
      const currentResponse = await fetch(`/api/posts/${post.id}`);
      if (!currentResponse.ok)
        throw new Error(await readError(currentResponse));
      const current = (await currentResponse.json()).data as PostDocument;
      const nextKind = post.kind === "post" ? "draft" : "post";
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPath: post.path,
          expectedSha: current.sha,
          expectedHeadSha: current.headSha,
          kind: nextKind,
          slug: current.slug,
          body: current.body,
          frontMatter: {
            ...current.frontMatter,
            draft: nextKind === "draft",
          },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(nextKind === "post" ? "文章已发布。" : "文章已移入草稿。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function duplicate(post: PostSummary) {
    if (busyRef.current) return;
    const targetSlug = window.prompt(
      "将复制为草稿，请输入新文章的英文文件名：",
      `${post.slug}-copy`,
    );
    if (!targetSlug) return;
    busyRef.current = true;
    setBusy(post.path);
    setMessage("");
    try {
      const response = await fetch("/api/posts/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "duplicate",
          path: post.path,
          expectedSha: post.sha,
          targetSlug,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage("已复制为草稿，正文和关联图片已保留。可在草稿中继续编辑。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function remove(post: PostSummary) {
    if (busyRef.current) return;
    const deleteAssets = window.confirm(
      "确定删除文章吗？\n\n选择“确定”将删除文章但保留资源目录。若也要删除资源，请稍后在媒体库中单独删除。",
    );
    if (!deleteAssets) return;
    busyRef.current = true;
    setBusy(post.path);
    setMessage("");
    try {
      const response = await fetch(
        `/api/posts/${post.id}?sha=${encodeURIComponent(post.sha)}&deleteAssets=false`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setMessage("文章已删除，关联资源已保留。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  return (
    <section className="panel">
      <div className="post-list-summary">
        {!fixedKind ? (
          <div
            aria-label="文章状态"
            className="post-status-filters"
            role="group"
          >
            {(
              [
                ["all", "全部"],
                ["post", "已发布"],
                ["draft", "草稿"],
              ] as const
            ).map(([status, label]) => (
              <button
                aria-pressed={kind === status}
                className="post-status-filter"
                key={status}
                onClick={() => updateFilter({ status })}
                type="button"
              >
                {label}
                <span>{counts[status]}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="list-primary">
            {fixedKind === "draft" ? "草稿" : "已发布"} · {counts[fixedKind]} 篇
          </span>
        )}
        {hasFilters ? (
          <button className="button ghost" onClick={clearFilters} type="button">
            <X size={14} />
            清除筛选
          </button>
        ) : null}
      </div>
      <div className="toolbar">
        <label style={{ position: "relative" }}>
          <Search
            aria-hidden="true"
            size={15}
            style={{ left: 11, position: "absolute", top: 11 }}
          />
          <input
            aria-label="搜索文章"
            className="input search-input"
            onChange={(event) => updateFilter({ query: event.target.value })}
            placeholder="搜索标题、文件名、标签或分类"
            style={{ paddingLeft: 34 }}
            value={query}
          />
        </label>
        <select
          aria-label="按分类筛选"
          className="select filter-select"
          onChange={(event) => updateFilter({ category: event.target.value })}
          value={category}
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="按标签筛选"
          className="select filter-select"
          onChange={(event) => updateFilter({ tag: event.target.value })}
          value={tag}
        >
          <option value="">全部标签</option>
          {tags.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="排序"
          className="select filter-select"
          onChange={(event) =>
            updateFilter({ sort: event.target.value as "updated" | "date" })
          }
          value={sort}
        >
          <option value="updated">最近修改</option>
          <option value="date">发布时间</option>
        </select>
      </div>

      {visible.length ? (
        <>
          <div
            aria-busy={query !== deferredQuery}
            className="table-wrap post-table-wrap"
          >
            <table className="table post-table">
              <thead>
                <tr>
                  <th>文章</th>
                  <th>状态</th>
                  <th>分类</th>
                  <th>标签</th>
                  <th>更新时间</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((post) => (
                  <tr className="post-table-row" key={post.path}>
                    <td className="post-title-cell" data-label="文章">
                      <Link
                        className="post-title-link"
                        href={`/posts/${post.id}/edit?${new URLSearchParams({
                          returnTo: postListUrl(
                            basePath,
                            { ...listState, page: currentPage },
                            fixedKind,
                          ),
                        })}`}
                      >
                        {post.title}
                      </Link>
                      <div className="post-slug">{post.slug}</div>
                    </td>
                    <td data-label="状态">
                      <span
                        className={`badge${post.draft ? " warning" : " success"}`}
                      >
                        {post.draft ? (
                          <FileClock size={12} />
                        ) : (
                          <FileText size={12} />
                        )}
                        {post.draft ? "草稿" : "已发布"}
                      </span>
                    </td>
                    <td className="muted" data-label="分类">
                      {post.categories
                        .map((path) => path.join(" / "))
                        .join(", ") || "—"}
                    </td>
                    <td data-label="标签">
                      <div className="tag-row">
                        {post.tags.slice(0, 3).map((item) => (
                          <span className="badge" key={item}>
                            {item}
                          </span>
                        ))}
                        {post.tags.length > 3 ? (
                          <span
                            className="badge"
                            title={post.tags.slice(3).join("、")}
                          >
                            +{post.tags.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="muted" data-label="更新时间">
                      {formatDate(post.updated)}
                    </td>
                    <td className="post-table-action-cell" data-label="操作">
                      <div className="row-actions post-row-actions">
                        <button
                          aria-label={post.draft ? "发布文章" : "移入草稿"}
                          className="icon-button ghost"
                          disabled={Boolean(busy)}
                          onClick={() => transition(post)}
                          title={post.draft ? "发布文章" : "移入草稿"}
                          type="button"
                        >
                          {post.draft ? (
                            <FileText size={15} />
                          ) : (
                            <FileClock size={15} />
                          )}
                        </button>
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              aria-label={`更多操作：${post.title}`}
                              className="icon-button ghost"
                              disabled={Boolean(busy)}
                              type="button"
                            >
                              <MoreHorizontal size={17} />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              className="post-action-menu"
                              sideOffset={6}
                            >
                              <DropdownMenu.Item
                                className="post-action-item"
                                disabled={Boolean(busy)}
                                onSelect={() => void duplicate(post)}
                              >
                                <Copy size={15} />
                                复制为草稿
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="post-action-separator" />
                              <DropdownMenu.Item
                                className="post-action-item danger"
                                disabled={Boolean(busy)}
                                onSelect={() => void remove(post)}
                              >
                                <Trash2 size={15} />
                                删除文章
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="muted">
              共 {filtered.length} 篇，第 {currentPage}/{pageCount} 页
            </span>
            <div className="row-actions">
              <button
                aria-label="上一页"
                className="icon-button"
                disabled={currentPage <= 1}
                onClick={() =>
                  setListState((current) => ({
                    ...current,
                    page: Math.max(1, currentPage - 1),
                  }))
                }
                type="button"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="下一页"
                className="icon-button"
                disabled={currentPage >= pageCount}
                onClick={() =>
                  setListState((current) => ({
                    ...current,
                    page: Math.min(pageCount, currentPage + 1),
                  }))
                }
                type="button"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          action={
            hasFilters ? (
              <button className="button" onClick={clearFilters} type="button">
                显示全部{fixedKind === "draft" ? "草稿" : "文章"}
              </button>
            ) : (
              <Link className="button primary" href="/posts/new">
                新建文章
              </Link>
            )
          }
          description={
            posts.length
              ? "没有符合当前筛选条件的文章。"
              : "创建第一篇内容，保存为草稿后再发布。"
          }
          title={posts.length ? "没有匹配结果" : "还没有文章"}
        />
      )}
      {message ? (
        <div aria-live="polite" className="toast">
          {message}
        </div>
      ) : null}
    </section>
  );
}
