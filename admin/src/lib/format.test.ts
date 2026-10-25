import { describe, expect, it } from "vitest";
import {
  blogTimestampToEpoch,
  formatDate,
  formatDuration,
  formatRelative,
  isDeploymentAttempt,
  workflowEventLabel,
  workflowLabel,
  workflowTone,
} from "@/lib/format";

describe("formatDate", () => {
  it("treats timezone-free Hexo timestamps as Shanghai wall-clock time", () => {
    expect(formatDate("2026-08-29 17:05:07")).toBe(
      "2026/08/29 17:05:07",
    );
  });

  it("converts absolute ISO timestamps to Shanghai time", () => {
    expect(formatDate("2026-08-29T09:05:07.000Z")).toBe(
      "2026/08/29 17:05:07",
    );
  });

  it("leaves invalid local timestamps visible instead of normalizing them", () => {
    expect(formatDate("2026-02-29 12:00:00")).toBe(
      "2026-02-29 12:00:00",
    );
  });
});

describe("workflow presentation", () => {
  it("labels skipped runs neutrally instead of as failures", () => {
    expect(workflowLabel("completed", "skipped")).toBe("已跳过");
    expect(workflowTone("completed", "skipped")).toBe("neutral");
    expect(workflowTone("completed", "failure")).toBe("danger");
    expect(workflowTone("in_progress", null)).toBe("warning");
    expect(workflowTone("completed", "success")).toBe("success");
  });

  it("translates common trigger events", () => {
    expect(workflowEventLabel("push")).toBe("推送");
    expect(workflowEventLabel("issue_comment")).toBe("评论");
    expect(workflowEventLabel("custom_event")).toBe("custom_event");
  });

  it("ignores skipped runs when looking for real deployments", () => {
    expect(isDeploymentAttempt({ status: "completed", conclusion: "skipped" })).toBe(false);
    expect(isDeploymentAttempt({ status: "queued", conclusion: null })).toBe(true);
    expect(isDeploymentAttempt({ status: "completed", conclusion: "failure" })).toBe(true);
  });
});

describe("compact durations", () => {
  it("keeps minute durations on one short line", () => {
    expect(formatDuration("2026-10-07T00:00:00Z", "2026-10-07T00:01:55Z")).toBe("1分55秒");
    expect(formatDuration("2026-10-07T00:00:00Z", "2026-10-07T00:00:36Z")).toBe("36 秒");
  });

  it("describes recent times relatively", () => {
    const now = Date.parse("2026-10-25T10:00:00Z");
    expect(formatRelative(now - 5_000, now)).toBe("刚刚");
    expect(formatRelative(now - 3 * 60_000, now)).toBe("3 分钟前");
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe("2 小时前");
    expect(formatRelative(now - 3 * 86_400_000, now)).toBe("3 天前");
  });
});

describe("blogTimestampToEpoch", () => {
  it("reads Hexo wall-clock time in the blog timezone", () => {
    expect(blogTimestampToEpoch("2026-10-07 23:18:00")).toBe(
      Date.parse("2026-10-07T15:18:00Z"),
    );
    expect(blogTimestampToEpoch("2026-10-07 23:18:00", "UTC")).toBe(
      Date.parse("2026-10-07T23:18:00Z"),
    );
  });
});
