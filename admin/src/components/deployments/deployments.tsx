"use client";

import {
  ExternalLink,
  GitCommitHorizontal,
  Play,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatDate, workflowLabel } from "@/lib/format";
import type { WorkflowRun } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

function duration(start: string, end: string) {
  const milliseconds = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function canRetry(run: WorkflowRun) {
  return (
    run.status === "completed" &&
    run.conclusion !== "success" &&
    run.conclusion !== "skipped"
  );
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
  const [message, setMessage] = useState("");
  const [trackedRunId, setTrackedRunId] = useState<number>();
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      pollAbortRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    },
    [],
  );

  function stopPolling() {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    setPolling(false);
  }

  function beginPolling(baselineId: number) {
    stopPolling();
    const controller = new AbortController();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let observedRunId: number | undefined;
    let transientFailures = 0;
    pollAbortRef.current = controller;
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
          setMessage("等待部署状态超时；工作流可能仍在 GitHub 中运行，请手动刷新。 ");
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
      setCurrentRuns(await readRuns());
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

  return (
    <section className="panel">
      <div className="panel-header deployments-header">
        <div>
          <h2 className="panel-title">{workflowId}</h2>
          {trackedRun ? (
            <div className="list-secondary">
              本次运行 #{trackedRun.id} · {trackedRun.commitSha.slice(0, 7)}
            </div>
          ) : null}
        </div>
        <div className="button-group">
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
            <RefreshCw className={polling ? "spin" : ""} size={15} />
            {polling ? "自动刷新中" : "刷新"}
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
      {currentRuns.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>工作流 / Commit</th>
                <th>分支</th>
                <th>触发方式</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>运行时长</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {currentRuns.map((run) => (
                <tr className={run.id === trackedRunId ? "tracked-run" : undefined} key={run.id}>
                  <td className="post-title-cell">
                    <div className="list-primary">
                      {run.name} {run.id === trackedRunId ? <span className="badge warning">本次</span> : null}
                    </div>
                    <div className="list-secondary" title={run.title}>
                      {run.title || "无 Commit 信息"}
                    </div>
                    <div className="commit-sha">
                      <GitCommitHorizontal aria-hidden="true" size={13} />
                      {run.commitSha.slice(0, 7)}
                    </div>
                  </td>
                  <td><span className="badge">{run.branch}</span></td>
                  <td>{run.event === "workflow_dispatch" ? "手动触发" : run.event}</td>
                  <td>
                    <span
                      className={`badge ${
                        run.conclusion === "success"
                          ? "success"
                          : run.status !== "completed"
                            ? "warning"
                            : "danger"
                      }`}
                    >
                      {workflowLabel(run.status, run.conclusion)}
                    </span>
                  </td>
                  <td className="muted">{formatDate(run.startedAt)}</td>
                  <td className="muted">{duration(run.startedAt, run.updatedAt)}</td>
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
