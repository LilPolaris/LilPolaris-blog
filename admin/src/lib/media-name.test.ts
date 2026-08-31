import { describe, expect, it } from "vitest";
import {
  prepareMediaFileName,
  prepareOrReuseMediaFileName,
  replaceAssetImageReference,
  sanitizeMediaStem,
  uniqueMediaName,
  validateImageFileExtension,
} from "@/lib/media-name";

const now = new Date("2026-08-29T16:00:00.000Z");

describe("media file names", () => {
  it("uses Shanghai date, an ASCII stem, a short code, and a lower extension", () => {
    expect(
      prepareMediaFileName({
        originalName: "My Holiday Photo.PNG",
        uploadedFileName: "My Holiday Photo.PNG",
        contentType: "image/png",
        now,
        shortcode: "A1B2C3",
      }),
    ).toBe("20260830-my-holiday-photo-a1b2c3.png");
  });

  it("falls back for Chinese-only and Windows-reserved stems", () => {
    expect(sanitizeMediaStem("封面.png")).toBe("image");
    expect(sanitizeMediaStem("CON.png")).toBe("image");
  });

  it("sanitizes special characters and only treats the final suffix as extension", () => {
    expect(
      prepareMediaFileName({
        originalName: "  Draft.v2 + Hero!!.jpeg",
        uploadedFileName: "converted.webp",
        contentType: "image/webp",
        now,
        shortcode: "abcdef",
      }),
    ).toBe("20260830-draft-v2-hero-abcdef.webp");
  });

  it("bounds long stems", () => {
    const result = prepareMediaFileName({
      originalName: `${"a".repeat(400)}.png`,
      uploadedFileName: "upload.png",
      contentType: "image/png",
      now,
      shortcode: "abcdef",
    });
    expect(result.length).toBeLessThanOrEqual(140);
    expect(result).toMatch(/^20260830-a+-abcdef\.png$/);
  });

  it("validates extension separately from MIME", () => {
    expect(validateImageFileExtension("photo.jpeg", "image/jpeg")).toBe(
      "jpeg",
    );
    expect(() => validateImageFileExtension("photo.png", "image/jpeg")).toThrow(
      /MIME/,
    );
    expect(() => validateImageFileExtension("photo.exe", "image/png")).toThrow(
      /MIME/,
    );
  });

  it("allocates suffixes case-insensitively", () => {
    expect(
      uniqueMediaName("20260830-cover-abcdef.png", [
        "20260830-COVER-ABCDEF.PNG",
        "20260830-cover-abcdef-2.png",
      ]),
    ).toBe("20260830-cover-abcdef-3.png");
  });

  it("keeps an already prepared browser filename", () => {
    expect(
      prepareOrReuseMediaFileName({
        originalName: "Original Cover.png",
        uploadedFileName: "20260830-original-cover-abcdef.webp",
        contentType: "image/webp",
      }),
    ).toBe("20260830-original-cover-abcdef.webp");
  });

  it("rewrites both single- and double-quoted asset_img references", () => {
    const source = [
      '{% asset_img "before.png" "first" %}',
      "{% asset_img 'before.png' 'second' %}",
      '{% asset_img "other.png" "third" %}',
    ].join("\n");
    expect(
      replaceAssetImageReference(source, "before.png", "after.png"),
    ).toBe(
      [
        '{% asset_img "after.png" "first" %}',
        "{% asset_img 'after.png' 'second' %}",
        '{% asset_img "other.png" "third" %}',
      ].join("\n"),
    );
  });
});
