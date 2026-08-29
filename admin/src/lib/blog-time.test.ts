import { describe, expect, it } from "vitest";
import { formatBlogTimestamp, isValidBlogTimestamp } from "@/lib/blog-time";

describe("blog timestamps", () => {
  it("formats a fixed instant in the configured timezone", () => {
    expect(
      formatBlogTimestamp(new Date("2026-08-29T09:05:07.000Z"), "Asia/Shanghai"),
    ).toBe("2026-08-29 17:05:07");
  });

  it("validates both syntax and real calendar dates", () => {
    expect(isValidBlogTimestamp("")).toBe(true);
    expect(isValidBlogTimestamp("2024-02-29 23:59:59")).toBe(true);
    expect(isValidBlogTimestamp("2026-02-29 12:00:00")).toBe(false);
    expect(isValidBlogTimestamp("2026-08-29T12:00:00")).toBe(false);
  });
});
