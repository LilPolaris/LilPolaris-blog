import { describe, expect, it } from "vitest";
import { thumbnailUrl, thumbnailWidth } from "@/lib/media-thumbnail";

describe("thumbnailWidth", () => {
  it("is optional and clamps to a sane range", () => {
    expect(thumbnailWidth(null)).toBeUndefined();
    expect(thumbnailWidth("40")).toBe(120);
    expect(thumbnailWidth("360")).toBe(360);
    expect(thumbnailWidth("99999")).toBe(1200);
  });

  it("rejects non-integer widths", () => {
    expect(() => thumbnailWidth("abc")).toThrow("缩略图宽度不合法");
    expect(() => thumbnailWidth("12.5")).toThrow();
  });
});

describe("thumbnailUrl", () => {
  it("only decorates proxy URLs", () => {
    expect(thumbnailUrl("/api/media/content?path=a.png&sha=1", 360)).toBe(
      "/api/media/content?path=a.png&sha=1&w=360",
    );
    expect(thumbnailUrl("https://example.com/a.png", 360)).toBe(
      "https://example.com/a.png",
    );
  });
});
