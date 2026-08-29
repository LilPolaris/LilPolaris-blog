import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";

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
