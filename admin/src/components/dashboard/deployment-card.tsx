"use client";

import { ArrowRight, Clock3, ExternalLink, GitCommitHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatDate,
  formatDuration,
  formatRelative,
  isDeploymentAttempt,
  workflowLabel,
  workflowTone,
} from "@/lib/format";
import type { WorkflowRun } from "@/lib/types";

const WATCH_INTERVAL_MS = 6_000;
const WATCH_TIMEOUT_MS = 15 * 60 * 1000;

export function DeploymentCard({
  initialRun,
  unavailable,
  publicBlogUrl,
}: {
  initialRun: WorkflowRun | null;
  unavailable: boolean;
  publicBlogUrl: string;
}) {
  const [run, setRun] = useState(initialRun);
  const active = Boolean(run && run.status !== "completed");

  useEffect(() => {
    if (!active) return;
    const deadline = Date.now() + WATCH_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/workflows", { cache: "no-store" });
        if (response.ok) {
          const runs = ((await response.json()).data || []) as WorkflowRun[];
          const latest = runs.find(isDeploymentAttempt);
          if (!cancelled && latest) setRun(latest);
          if (latest?.status === "completed") return;
        }
      } catch {
        // A missed refresh is retried on the next tick.
      }
      if (!cancelled && Date.now() < deadline) {
        timer = setTimeout(tick, WATCH_INTERVAL_MS);
      }
    };
    timer = setTimeout(tick, WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">最近部署</h2>
        <Link className="button ghost" href="/deployments">
          全部记录 <ArrowRight size={14} />
        </Link>
      </div>
      <div className="panel-body deploy-card-body">
        {unavailable ? (
          <div className="alert danger" role="status">
            部署状态暂时读取失败，不代表尚未部署。
          </div>
        ) : run ? (
          <>
            <div className="deploy-card-status">
              <span className={`badge ${workflowTone(run.status, run.conclusion)}`}>
                {active ? <span className="pulse-dot" /> : null}
                {workflowLabel(run.status, run.conclusion)}
              </span>
              <span className="muted">
                {active ? "正在部署，完成后自动更新" : formatRelative(run.updatedAt)}
              </span>
            </div>
            <div className="deploy-card-title" title={run.title}>
              {run.title || "无 Commit 信息"}
            </div>
            <div className="deploy-card-meta">
              <span>
                <GitCommitHorizontal aria-hidden="true" size={13} />
                {run.commitSha.slice(0, 7)} · {run.branch}
              </span>
              <span>
                <Clock3 aria-hidden="true" size={13} />
                {formatDate(run.startedAt)}
                {run.status === "completed"
                  ? ` · 用时 ${formatDuration(run.startedAt, run.updatedAt)}`
                  : ""}
              </span>
            </div>
            <div className="deploy-card-links">
              <a href={run.htmlUrl} rel="noreferrer" target="_blank">
                GitHub 日志 <ExternalLink size={12} />
              </a>
              {run.conclusion === "success" && publicBlogUrl ? (
                <a href={publicBlogUrl} rel="noreferrer" target="_blank">
                  打开博客 <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            尚未找到部署记录。
          </p>
        )}
      </div>
    </section>
  );
}
