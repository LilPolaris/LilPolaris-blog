import { describe, expect, it } from "vitest";
import {
  assetImageTag,
  isPendingMediaReferenced,
  pendingMediaName,
} from "@/lib/pending-media";

describe("pending media", () => {
  it("creates deterministic safe paste names", () => {
    expect(
      pendingMediaName("image/png", new Date(2026, 6, 24, 9, 8, 7), "abc123"),
    ).toBe("paste-20260724-090807-abc123.png");
  });

  it("inserts and detects Hexo asset tags", () => {
    const media = {
      id: "one",
      name: "paste.png",
      contentType: "image/png",
      size: 8,
      blob: new Blob(),
      alt: "示例图",
    };
    const tag = assetImageTag(media);
    expect(tag).toBe('{% asset_img "paste.png" "示例图" %}');
    expect(isPendingMediaReferenced(tag, media)).toBe(true);
    expect(isPendingMediaReferenced("已撤销图片", media)).toBe(false);
  });
});
