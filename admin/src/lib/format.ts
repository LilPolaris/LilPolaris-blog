import { isValidBlogTimestamp } from "@/lib/blog-time";

export function formatDate(value?: string | null, withTime = true) {
  if (!value) return "—";
  const localMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (localMatch) {
    const [, year, month, day, hour, minute, second] = localMatch;
    const localTimestamp = `${year}-${month}-${day} ${hour || "00"}:${minute || "00"}:${second || "00"}`;
    if (isValidBlogTimestamp(localTimestamp)) {
      return `${year}/${month}/${day}${withTime && hour ? ` ${hour}:${minute}:${second}` : ""}`;
    }
    return value;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(date);
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function workflowLabel(status: string, conclusion?: string | null) {
  if (status !== "completed") {
    return status === "in_progress" ? "运行中" : "等待中";
  }
  if (conclusion === "success") return "成功";
  if (conclusion === "cancelled") return "已取消";
  if (conclusion === "failure") return "失败";
  if (conclusion === "skipped") return "已跳过";
  if (conclusion === "timed_out") return "超时";
  if (conclusion === "action_required") return "待批准";
  if (conclusion === "neutral") return "已完成";
  return conclusion || "已完成";
}

export type WorkflowTone = "success" | "warning" | "danger" | "neutral";

export function workflowTone(
  status: string,
  conclusion?: string | null,
): WorkflowTone {
  if (status !== "completed") return "warning";
  if (conclusion === "success") return "success";
  if (
    conclusion === "skipped" ||
    conclusion === "neutral" ||
    conclusion === "cancelled"
  ) {
    return "neutral";
  }
  return "danger";
}

const WORKFLOW_EVENT_LABELS: Record<string, string> = {
  push: "推送",
  workflow_dispatch: "手动触发",
  issue_comment: "评论",
  issues: "Issue",
  pull_request: "PR",
  schedule: "定时",
  repository_dispatch: "外部触发",
};

export function workflowEventLabel(event: string) {
  return WORKFLOW_EVENT_LABELS[event] || event;
}

/**
 * Runs GitHub skipped before doing any work (for example guestbook comments
 * hitting the deploy workflow's issue_comment trigger) say nothing about the
 * site, so status summaries look past them.
 */
export function isDeploymentAttempt(run: {
  status: string;
  conclusion?: string | null;
}) {
  return !(run.status === "completed" && run.conclusion === "skipped");
}

export function formatDuration(start: string, end: string) {
  const milliseconds = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

export function formatRelative(value: string | number | Date, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(new Date(time).toISOString(), false);
}

/**
 * Hexo front matter stores wall-clock time without an offset. Interpret it in
 * the blog's timezone so relative labels are right on UTC servers too.
 */
export function blogTimestampToEpoch(value: string, timeZone = "Asia/Shanghai") {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return new Date(value).getTime();
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const asUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(asUtc))
      .map((part) => [part.type, part.value]),
  );
  const zoned = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - (zoned - asUtc);
}
