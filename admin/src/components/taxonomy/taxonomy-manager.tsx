"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Merge, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";

export interface TaxonomyAffectedPost {
  kind: "post" | "draft";
  slug: string;
  title: string;
}

export interface TaxonomyManagerEntry {
  count: number;
  key: string;
  name: string;
  path: string[];
  posts: TaxonomyAffectedPost[];
  type: "tag" | "category";
}

function pathLabel(entry: TaxonomyManagerEntry, leaf = entry.name) {
  if (entry.type === "tag") return leaf;
  return [...entry.path.slice(0, -1), leaf].join(" / ");
}

export function TaxonomyManager({
  initialEntries,
}: {
  initialEntries: TaxonomyManagerEntry[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"all" | "tag" | "category">("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<TaxonomyManagerEntry>();
  const [nextName, setNextName] = useState("");
  const visible = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return initialEntries.filter(
      (entry) =>
        (type === "all" || entry.type === type) &&
        (!normalized ||
          `${pathLabel(entry)} ${entry.posts.map((post) => `${post.title} ${post.slug}`).join(" ")}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [initialEntries, query, type]);

  function prepareRename(entry: TaxonomyManagerEntry) {
    setMessage("");
    setNextName(entry.name);
    setPending(entry);
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = nextName.trim();
    if (!pending || !next || next === pending.name) return;

    setBusy(pending.key);
    setMessage("");
    try {
      const response = await fetch("/api/taxonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: pending.type,
          from: pending.name,
          fromPath: pending.path,
          to: next,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "批量修改失败。");
      }
      setPending(undefined);
      setMessage(
        `已将“${pathLabel(pending)}”改为“${pathLabel(pending, next)}”，修改 ${payload.data.affected} 篇文章。`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量修改失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <label style={{ position: "relative" }}>
            <Search
              aria-hidden="true"
              size={15}
              style={{ left: 11, position: "absolute", top: 11 }}
            />
            <input
              aria-label="搜索分类、标签或文章"
              className="input search-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索完整路径或文章"
              style={{ paddingLeft: 34 }}
              value={query}
            />
          </label>
          <select
            aria-label="筛选类型"
            className="select filter-select"
            onChange={(event) =>
              setType(event.target.value as "all" | "tag" | "category")
            }
            value={type}
          >
            <option value="all">全部类型</option>
            <option value="category">分类</option>
            <option value="tag">标签</option>
          </select>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>完整路径</th>
                  <th>类型</th>
                  <th>文章数量</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.key}>
                    <td>
                      <div className="list-primary">{pathLabel(entry)}</div>
                      {entry.type === "category" && entry.path.length > 1 ? (
                        <div className="list-secondary">
                          父级：{entry.path.slice(0, -1).join(" / ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className="badge">
                        {entry.type === "tag" ? "标签" : "分类路径"}
                      </span>
                    </td>
                    <td>{entry.count}</td>
                    <td>
                      <button
                        className="button"
                        disabled={busy === entry.key}
                        onClick={() => prepareRename(entry)}
                        type="button"
                      >
                        <Merge size={14} />
                        {entry.type === "tag" ? "重命名 / 合并" : "重命名路径末级"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="分类和标签从文章 Front Matter 中实时统计。"
            title="没有匹配项目"
          />
        )}
      </section>

      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && !busy) setPending(undefined);
        }}
        open={Boolean(pending)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          {pending ? (
            <Dialog.Content className="panel dialog-card taxonomy-dialog">
              <div className="panel-header">
                <Dialog.Title className="panel-title">
                  {pending.type === "tag" ? "重命名或合并标签" : "重命名分类路径"}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  查看完整分类路径和受影响文章后确认批量重命名。
                </Dialog.Description>
                <Dialog.Close asChild>
                  <button
                    aria-label="关闭"
                    className="icon-button ghost"
                    disabled={Boolean(busy)}
                    type="button"
                  >
                    <X size={17} />
                  </button>
                </Dialog.Close>
              </div>
              <form className="panel-body" onSubmit={rename}>
                <div className="alert" style={{ marginBottom: 16 }}>
                  <AlertTriangle aria-hidden="true" size={18} />
                  <div>
                    此操作会用一个 Git Commit 修改下列 {pending.count} 篇文章。
                    {pending.type === "category"
                      ? "只匹配这条完整分类路径，不影响其他父分类下的同名分类。"
                      : "若目标标签已存在，将合并为同一标签。"}
                  </div>
                </div>
                <dl className="taxonomy-impact-summary">
                  <div>
                    <dt>当前完整路径</dt>
                    <dd>{pathLabel(pending)}</dd>
                  </div>
                  <div>
                    <dt>修改后</dt>
                    <dd>{pathLabel(pending, nextName.trim() || pending.name)}</dd>
                  </div>
                </dl>
                <label className="field" style={{ marginTop: 16 }}>
                  <span className="field-label">新的末级名称</span>
                  <input
                    autoFocus
                    className="input"
                    maxLength={50}
                    onChange={(event) => setNextName(event.target.value)}
                    value={nextName}
                  />
                </label>
                <div className="taxonomy-post-list" style={{ marginTop: 16 }}>
                  <div className="field-label">受影响文章</div>
                  <ul className="config-list">
                    {pending.posts.map((post) => (
                      <li key={`${post.kind}:${post.slug}`}>
                        <span>{post.title}</span>
                        <small>
                          {post.kind === "draft" ? "草稿" : "已发布"} · {post.slug}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="button-group dialog-actions">
                  <Dialog.Close asChild>
                    <button className="button" disabled={Boolean(busy)} type="button">
                      取消
                    </button>
                  </Dialog.Close>
                  <button
                    className="button primary"
                    disabled={
                      Boolean(busy) ||
                      !nextName.trim() ||
                      nextName.trim() === pending.name
                    }
                    type="submit"
                  >
                    <Merge size={15} />
                    {busy ? "正在提交…" : `确认修改 ${pending.count} 篇文章`}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>

      {message ? (
        <div aria-live="polite" className="toast">
          {message}
        </div>
      ) : null}
    </>
  );
}
