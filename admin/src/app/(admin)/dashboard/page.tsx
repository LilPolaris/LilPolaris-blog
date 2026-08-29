import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileClock,
  FileText,
  GitBranch,
  Plus,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatDate, workflowLabel } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import { getDashboardData } from "@/lib/repository/repository";

export const metadata = { title: "概览" };

export default async function DashboardPage() {
  const repository = await getRepository();
  const data = await getDashboardData(repository);
  const run = data.latestRun;
  const postsUnavailable = data.sourceStatus?.posts === "error";
  const workflowUnavailable = data.sourceStatus?.workflow === "error";
  const connectionUnavailable = data.sourceStatus?.connection === "error";

  return (
    <>
      <PageHeader
        actions={
          <Link className="button primary" href="/posts/new">
            <Plus size={16} />
            新建文章
          </Link>
        }
        description="关注内容、同步与部署状态。"
        title="概览"
      />

      <section className="stats" aria-label="内容统计">
        <div className="stat">
          <div className="stat-label">已发布文章</div>
          <div className="stat-value">
            {postsUnavailable ? "—" : data.totalPosts}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">草稿</div>
          <div className="stat-value">
            {postsUnavailable ? "—" : data.totalDrafts}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">仓库连接</div>
          <div
            style={{
              alignItems: "center",
              color: data.repositoryConnected
                ? "var(--success)"
                : "var(--destructive)",
              display: "flex",
              fontSize: 16,
              fontWeight: 650,
              gap: 8,
              marginTop: 10,
            }}
          >
            {data.repositoryConnected ? (
              <CheckCircle2 size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
              {data.repositoryConnected ? "已连接" : "连接失败"}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">最近修改</h2>
            <Link className="button ghost" href="/posts">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          {postsUnavailable ? (
            <div className="panel-body">
              <div className="alert danger" role="status">
                <CircleAlert aria-hidden="true" size={18} />
                文章数据暂时读取失败，请稍后重新加载。
              </div>
            </div>
          ) : data.recentUpdated.length ? (
            <ul className="list">
              {data.recentUpdated.map((post) => (
                <li className="list-item" key={post.path}>
                  <div style={{ minWidth: 0 }}>
                    <Link
                      className="list-primary"
                      href={`/posts/${post.id}/edit`}
                    >
                      {post.title}
                    </Link>
                    <div className="list-secondary">
                      {post.slug} · {formatDate(post.updated)}
                    </div>
                  </div>
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

        <div style={{ display: "grid", gap: 20 }}>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">最近部署</h2>
              <Link className="button ghost" href="/deployments">
                记录 <ArrowRight size={14} />
              </Link>
            </div>
            <div className="panel-body">
              {workflowUnavailable ? (
                <div className="alert danger" role="status">
                  <CircleAlert aria-hidden="true" size={18} />
                  部署状态暂时读取失败，不代表尚未部署。
                </div>
              ) : run ? (
                <>
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span className="list-primary">{run.name}</span>
                    <span
                      className={`badge ${
                        run.conclusion === "success"
                          ? "success"
                          : run.status !== "completed"
                            ? "warning"
                            : "danger"
                      }`}
                    >
                      <Rocket size={12} />
                      {workflowLabel(run.status, run.conclusion)}
                    </span>
                  </div>
                  <div className="list-secondary" style={{ marginTop: 12 }}>
                    <GitBranch size={12} style={{ verticalAlign: -2 }} />{" "}
                    {run.branch} · {run.title}
                  </div>
                  <div className="list-secondary" style={{ marginTop: 5 }}>
                    <Clock3 size={12} style={{ verticalAlign: -2 }} />{" "}
                    {formatDate(run.startedAt)}
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  尚未找到部署记录。
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">同步状态</h2>
            </div>
            <div className="panel-body">
              <div className="repo-line" style={{ marginBottom: 6 }}>
                <span
                  className="status-dot"
                  style={
                    postsUnavailable || connectionUnavailable
                      ? { background: "var(--warning)" }
                      : undefined
                  }
                />
                {postsUnavailable || connectionUnavailable
                  ? "部分 GitHub 数据读取失败"
                  : "GitHub 数据已读取"}
              </div>
              <div className="list-secondary">
                本次读取：{formatDate(data.lastSyncAt)}
              </div>
              {postsUnavailable || connectionUnavailable ? (
                <div className="list-secondary" style={{ marginTop: 5 }}>
                  请检查网络或 GitHub 状态后重新加载；页面不会把失败显示成空数据。
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
