"use client";

import {
  ExternalLink,
  GitCommitHorizontal,
  Play,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  formatDate,
  formatDuration,
  isDeploymentAttempt,
  workflowEventLabel,
  workflowLabel,
  workflowTone,
} from "@/lib/format";
import type { WorkflowRun } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const WATCH_INTERVAL_MS = 5_000;
const WATCH_TIMEOUT_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

function canRetry(run: WorkflowRun) {
  return (
    run.status === "completed" &&
    run.conclusion !== "success" &&
    run.conclusion !== "skipped"
  );
}

function hasActiveRun(runs: WorkflowRun[]) {
  return runs.some((run) => run.status !== "completed");
}

async function readRuns(signal?: AbortSignal) {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch("/api/workflows", {
    signal: requestSignal,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "部署状态读取失败。");
  }
  return payload.data as WorkflowRun[];
}

export function Deployments({
  publicBlogUrl,
  runs,
  workflowId,
}: {
  publicBlogUrl: string;
  runs: WorkflowRun[];
  workflowId: string;
}) {
  const [currentRuns, setCurrentRuns] = useState(runs);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [watching, setWatching] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [message, setMessage] = useState("");
  const [trackedRunId, setTrackedRunId] = useState<number>();
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);

  const stopWatching = useCallback(() => {
    if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
    watchTimerRef.current = null;
    setWatching(false);
  }, []);

  // Runs started elsewhere (a push from the editor, a merge) are followed
  // automatically while this page is open, so it never shows a stale
  // "running" badge that only a manual refresh would clear.
  const startWatching = useCallback(() => {
    if (watchTimerRef.current || pollingRef.current) return;
    const deadline = Date.now() + WATCH_TIMEOUT_MS;
    setWatching(true);
    const tick = async () => {
      if (pollingRef.current) {
        watchTimerRef.current = null;
        setWatching(false);
        return;
      }
      try {
        const nextRuns = await readRuns();
        setCurrentRuns(nextRuns);
        if (!hasActiveRun(nextRuns) || Date.now() >= deadline) {
          watchTimerRef.current = null;
          setWatching(false);
          return;
        }
      } catch {
        if (Date.now() >= deadline) {
          watchTimerRef.current = null;
          setWatching(false);
          return;
        }
      }
      watchTimerRef.current = setTimeout(tick, WATCH_INTERVAL_MS);
    };
    watchTimerRef.current = setTimeout(tick, WATCH_INTERVAL_MS);
  }, []);

  useEffect(() => {
    if (hasActiveRun(runs)) startWatching();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || pollingRef.current) return;
      void readRuns()
        .then((nextRuns) => {
          setCurrentRuns(nextRuns);
          if (hasActiveRun(nextRuns)) startWatching();
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      pollAbortRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    };
  }, [runs, startWatching]);

  function stopPolling() {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    pollingRef.current = false;
    setPolling(false);
  }

  function beginPolling(baselineId: number) {
    stopPolling();
    stopWatching();
    const controller = new AbortController();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let observedRunId: number | undefined;
    let transientFailures = 0;
    pollAbortRef.current = controller;
    pollingRef.current = true;
    setPolling(true);

    const poll = async () => {
      try {
        const nextRuns = await readRuns(controller.signal);
        setCurrentRuns(nextRuns);
        const tracked = observedRunId
          ? nextRuns.find((run) => run.id === observedRunId)
          : nextRuns.find(
              (run) =>
                run.id > baselineId && run.event === "workflow_dispatch",
            );
        if (tracked) {
          observedRunId ??= tracked.id;
          transientFailures = 0;
          setTrackedRunId(tracked.id);
          if (tracked.status === "completed") {
            stopPolling();
            setMessage(
              tracked.conclusion === "success"
                ? `部署成功，Commit ${tracked.commitSha.slice(0, 7)} 已完成。`
                : `部署${workflowLabel(tracked.status, tracked.conclusion)}，可查看日志后重试。`,
            );
            return;
          }
          setMessage(
            `已找到本次运行 #${tracked.id}，当前${workflowLabel(tracked.status, tracked.conclusion)}。`,
          );
        } else {
          setMessage("触发请求已发送，正在等待 GitHub Actions 创建运行记录…");
        }
        if (Date.now() >= deadline) {
          stopPolling();
          setMessage("等待部署状态超时；工作流可能仍在 GitHub 中运行，请手动刷新。");
          return;
        }
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (controller.signal.aborted) return;
        if (Date.now() >= deadline) {
          stopPolling();
          setMessage("部署状态轮询已超时，请打开 GitHub Actions 查看最终结果。");
          return;
        }
        transientFailures += 1;
        setMessage(
          `部署状态暂时读取失败，正在自动重试（${transientFailures}）…`,
        );
        pollTimerRef.current = setTimeout(
          poll,
          Math.min(10_000, POLL_INTERVAL_MS * transientFailures),
        );
      }
    };

    void poll();
  }

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const nextRuns = await readRuns();
      setCurrentRuns(nextRuns);
      if (hasActiveRun(nextRuns)) startWatching();
      setMessage("部署状态已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "部署状态读取失败。");
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(confirmMessage?: string) {
    if (
      !window.confirm(
        confirmMessage ||
          `确定手动触发 ${workflowId} 吗？当前仓库在 main push 时也会自动部署。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    const baselineId = currentRuns.reduce(
      (highest, run) => Math.max(highest, run.id),
      0,
    );
    try {
      const response = await fetch("/api/workflows", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "工作流触发失败。");
      }
      setTrackedRunId(undefined);
      setMessage("已请求 GitHub Actions 运行工作流，正在等待状态…");
      beginPolling(baselineId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "工作流触发失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!workflowId) {
    return (
      <section className="panel">
        <EmptyState
          description="在设置中填写支持 workflow_dispatch 的工作流文件名，例如 deploy.yml。"
          title="未配置部署工作流"
        />
      </section>
    );
  }

  const trackedRun = currentRuns.find((run) => run.id === trackedRunId);
  const skippedCount = currentRuns.filter(
    (run) => !isDeploymentAttempt(run),
  ).length;
  const visibleRuns = showSkipped
    ? currentRuns
    : currentRuns.filter(
        (run) => isDeploymentAttempt(run) || run.id === trackedRunId,
      );
  const autoRefreshing = polling || watching;

  return (
    <section className="panel">
      <div className="panel-header deployments-header">
        <div>
          <h2 className="panel-title">{workflowId}</h2>
          {trackedRun ? (
            <div className="list-secondary">
              本次运行 #{trackedRun.id} · {trackedRun.commitSha.slice(0, 7)}
            </div>
          ) : watching ? (
            <div className="list-secondary">有部署正在进行，页面会自动更新</div>
          ) : null}
        </div>
        <div className="button-group">
          {skippedCount ? (
            <label className="inline-toggle">
              <input
                checked={showSkipped}
                onChange={(event) => setShowSkipped(event.target.checked)}
                type="checkbox"
              />
              显示已跳过（{skippedCount}）
            </label>
          ) : null}
          {publicBlogUrl ? (
            <a
              className="button"
              href={publicBlogUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
              查看博客
            </a>
          ) : null}
          <button className="button" disabled={busy} onClick={refresh} type="button">
            <RefreshCw className={autoRefreshing ? "spin" : ""} size={15} />
            {autoRefreshing ? "自动刷新中" : "刷新"}
          </button>
          <button
            className="button primary"
            disabled={busy || polling}
            onClick={() => void dispatch()}
            type="button"
          >
            <Play size={15} />
            {busy ? "正在触发…" : polling ? "部署进行中…" : "触发部署"}
          </button>
        </div>
      </div>
      {visibleRuns.length ? (
        <div className="table-wrap">
          <table className="table deployments-table">
            <thead>
              <tr>
                <th>工作流 / Commit</th>
                <th>触发</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>
                  <span className="sr-only">详情</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRuns.map((run) => (
                <tr
                  className={[
                    run.id === trackedRunId ? "tracked-run" : "",
                    isDeploymentAttempt(run) ? "" : "skipped-run",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                  key={run.id}
                >
                  <td className="post-title-cell">
                    <div className="list-secondary run-title" title={run.title}>
                      {run.title || "无 Commit 信息"}
                    </div>
                    <div className="commit-sha">
                      <GitCommitHorizontal aria-hidden="true" size={13} />
                      {run.commitSha.slice(0, 7)} · {run.branch}
                      {run.id === trackedRunId ? (
                        <span className="badge warning">本次</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="nowrap">{workflowEventLabel(run.event)}</td>
                  <td>
                    <span
                      className={`badge ${workflowTone(run.status, run.conclusion)}`}
                    >
                      {workflowLabel(run.status, run.conclusion)}
                    </span>
                  </td>
                  <td className="muted nowrap">{formatDate(run.startedAt)}</td>
                  <td className="muted nowrap">
                    {run.status === "completed"
                      ? formatDuration(run.startedAt, run.updatedAt)
                      : "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <a
                        aria-label="打开 GitHub Actions 详情"
                        className="icon-button ghost"
                        href={run.htmlUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={15} />
                      </a>
                      {canRetry(run) ? (
                        <button
                          aria-label={`重试运行 ${run.id}`}
                          className="icon-button ghost"
                          disabled={busy || polling}
                          onClick={() =>
                            void dispatch(
                              `运行 #${run.id} 未成功。确定重新触发 ${workflowId} 吗？`,
                            )
                          }
                          title="重新触发部署"
                          type="button"
                        >
                          <RotateCw size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description={
            polling
              ? "已触发工作流，正在等待 GitHub 创建运行记录。"
              : currentRuns.length
                ? "最近的运行都被 GitHub 跳过，没有实际部署。"
                : "GitHub 尚未返回该工作流的运行记录。"
          }
          title={polling ? "等待部署进入队列" : "暂无部署记录"}
        />
      )}
      {message ? (
        <div className="deployment-feedback" aria-live="polite">
          <span>{message}</span>
          {trackedRun?.conclusion === "success" && publicBlogUrl ? (
            <a href={publicBlogUrl} rel="noreferrer" target="_blank">
              打开已部署博客 <ExternalLink size={13} />
            </a>
          ) : null}
          {trackedRun && canRetry(trackedRun) ? (
            <button
              className="button"
              disabled={busy || polling}
              onClick={() => void dispatch(`确定重试本次失败的部署吗？`)}
              type="button"
            >
              <RotateCw size={14} />
              重试部署
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
