import { describe, expect, it } from "vitest";
import {
  assetImageTag,
  isPendingMediaReferenced,
  pendingMediaName,
  uniquePendingMediaName,
} from "@/lib/pending-media";

describe("pending media", () => {
  it("creates Shanghai-dated names from a sanitized original name", () => {
    expect(
      pendingMediaName(
        "My Holiday.Final.PNG",
        "image/png",
        new Date("2026-07-23T16:00:00.000Z"),
        "ABC123",
      ),
    ).toBe("20260724-my-holiday-final-abc123.png");
    expect(
      pendingMediaName(
        "封面图.PNG",
        "image/png",
        new Date("2026-07-24T02:00:00.000Z"),
        "def456",
      ),
    ).toBe("20260724-image-def456.png");
    expect(
      pendingMediaName(
        "CON.JPEG",
        "image/jpeg",
        new Date("2026-07-24T02:00:00.000Z"),
        "a1b2c3",
      ),
    ).toBe("20260724-image-con-a1b2c3.jpeg");
  });

  it("deduplicates names case-insensitively without losing the extension", () => {
    expect(
      uniquePendingMediaName("20260724-image-abc123.png", [
        "20260724-IMAGE-ABC123.PNG",
        "20260724-image-abc123-2.png",
      ]),
    ).toBe("20260724-image-abc123-3.png");
  });

  it("inserts and detects double- or single-quoted Hexo asset tags", () => {
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
    expect(
      isPendingMediaReferenced("{% asset_img 'paste.png' '示例图' %}", media),
    ).toBe(true);
    expect(isPendingMediaReferenced("已撤销图片", media)).toBe(false);
  });
});
