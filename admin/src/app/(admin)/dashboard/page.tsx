import { ArrowRight, CircleAlert, ExternalLink, FileClock, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { DeploymentCard } from "@/components/dashboard/deployment-card";
import { LocalRecoveryList } from "@/components/dashboard/local-recovery-list";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { PageHeader } from "@/components/page-header";
import { blogTimestampToEpoch, formatDate, formatRelative } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import { getDashboardData } from "@/lib/repository/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import type { PostSummary } from "@/lib/types";

export const metadata = { title: "概览" };

function editHref(post: PostSummary) {
  return `/posts/${post.id}/edit`;
}

export default async function DashboardPage() {
  const [repository, config] = await Promise.all([
    getRepository(),
    getEffectiveRepositoryConfig(),
  ]);
  const data = await getDashboardData(repository, {
    timezone: config.timezone,
  });
  const postsUnavailable = data.sourceStatus?.posts === "error";
  const workflowUnavailable = data.sourceStatus?.workflow === "error";
  const connectionUnavailable = data.sourceStatus?.connection === "error";
  const now = Date.parse(data.lastSyncAt);
  const toEpoch = (value: string) => blogTimestampToEpoch(value, config.timezone);
  const continueDraft = data.recentDrafts[0];
  const shown = (value: number) => (postsUnavailable ? "—" : value);

  return (
    <>
      <PageHeader
        actions={
          <>
            <RefreshButton />
            <Link className="button primary" href="/posts/new">
              <Plus size={16} />
              新建文章
            </Link>
          </>
        }
        description={
          postsUnavailable
            ? "文章数据暂时读取失败。"
            : data.latestPublishedAt
              ? `上次发布于 ${formatRelative(toEpoch(data.latestPublishedAt), now)}。`
              : "还没有已发布的文章。"
        }
        title="概览"
      />

      {postsUnavailable || connectionUnavailable ? (
        <div className="alert danger dashboard-alert" role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            {postsUnavailable
              ? "文章列表读取失败，下面的数字不代表真实数量。"
              : "GitHub 仓库连接检查失败，保存和发布可能无法完成。"}
            请检查网络或 GitHub 状态后点击“刷新”。
          </span>
        </div>
      ) : null}

      <section className="stats stats-4" aria-label="内容统计">
        <Link className="stat" href="/posts?status=post">
          <div className="stat-label">已发布文章</div>
          <div className="stat-value">{shown(data.totalPosts)}</div>
        </Link>
        <Link className="stat" href="/drafts">
          <div className="stat-label">草稿</div>
          <div className="stat-value">{shown(data.totalDrafts)}</div>
        </Link>
        <div className="stat">
          <div className="stat-label">近 30 天有修改</div>
          <div className="stat-value">
            {shown(data.updatedLast30Days)}
            <span className="stat-unit">篇</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">上次发布</div>
          <div className="stat-value stat-value-text">
            {data.latestPublishedAt
              ? formatRelative(toEpoch(data.latestPublishedAt), now)
              : "—"}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-column">
          <LocalRecoveryList />

          {continueDraft ? (
            <Link className="continue-card" href={editHref(continueDraft)}>
              <span className="continue-icon">
                <PenLine aria-hidden="true" size={18} />
              </span>
              <span className="continue-copy">
                <span className="continue-label">继续写草稿</span>
                <strong>{continueDraft.title}</strong>
                <span className="list-secondary">
                  {continueDraft.slug} · 最后修改 {formatRelative(toEpoch(continueDraft.updated), now)}
                </span>
              </span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">最近修改</h2>
              <Link className="button ghost" href="/posts">
                全部文章 <ArrowRight size={14} />
              </Link>
            </div>
            {postsUnavailable ? (
              <div className="panel-body">
                <p className="muted" style={{ margin: 0 }}>
                  文章数据暂时读取失败，请稍后刷新。
                </p>
              </div>
            ) : data.recentUpdated.length ? (
              <ul className="list">
                {data.recentUpdated.map((post) => (
                  <li className="list-item" key={post.path}>
                    <div style={{ minWidth: 0 }}>
                      <Link className="list-primary" href={editHref(post)}>
                        {post.title}
                      </Link>
                      <div className="list-secondary">
                        {post.slug} · {formatDate(post.updated)}
                      </div>
                    </div>
                    {post.draft ? (
                      <span className="badge warning">
                        <FileClock size={12} />
                        草稿
                      </span>
                    ) : (
                      <span className="badge success">已发布</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel-body">
                <p className="muted" style={{ margin: 0 }}>
                  暂无文章，先创建第一篇内容吧。
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-column">
          <DeploymentCard
            initialRun={data.latestRun}
            publicBlogUrl={config.publicBlogUrl}
            unavailable={workflowUnavailable}
          />

          {data.recentPublished.length ? (
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">最近发布</h2>
              </div>
              <ul className="list">
                {data.recentPublished.map((post) => (
                  <li className="list-item compact" key={post.path}>
                    <div style={{ minWidth: 0 }}>
                      <Link className="list-primary" href={editHref(post)}>
                        {post.title}
                      </Link>
                      <div className="list-secondary">{formatDate(post.date, false)}</div>
                    </div>
                    <a
                      aria-label={`打开公开页面：${post.title}`}
                      className="icon-button ghost"
                      href={`${config.publicBlogUrl}/posts/${post.slug}/`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
