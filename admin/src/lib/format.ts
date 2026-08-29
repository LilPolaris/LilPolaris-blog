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
  return conclusion || "已完成";
}
