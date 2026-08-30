import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  detectImageContentType,
  normalizeImageBytes,
  STAGED_IMAGE_MAX_BYTES,
  validateStagedImageBytes,
} from "@/lib/image-upload";

describe("image upload normalization", () => {
  it("keeps an image whose bytes already match its reported type", async () => {
    const png = new Uint8Array(
      await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: "#336699",
        },
      })
        .png()
        .toBuffer(),
    );

    expect(await normalizeImageBytes(png, "image/png")).toBe(png);
  });

  it("converts browser-decodable bytes to the reported image type", async () => {
    const jpegReportedAsPng = new Uint8Array(
      await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 3,
          background: "#336699",
        },
      })
        .jpeg()
        .toBuffer(),
    );

    expect(detectImageContentType(jpegReportedAsPng)).toBe("image/jpeg");
    const normalized = await normalizeImageBytes(
      jpegReportedAsPng,
      "image/png",
    );
    expect(detectImageContentType(normalized)).toBe("image/png");
  });

  it("still rejects data that cannot be decoded as an image", async () => {
    await expect(
      normalizeImageBytes(new Uint8Array([1, 2, 3]), "image/png"),
    ).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
  });

  it("strictly checks staged size, extension, MIME, and magic bytes", () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(validateStagedImageBytes(png, "20260830-cover-abcdef.png", "image/png"))
      .toBe("image/png");
    expect(() =>
      validateStagedImageBytes(png, "20260830-cover-abcdef.jpg", "image/jpeg"),
    ).toThrow(/内容不一致/);
    expect(() =>
      validateStagedImageBytes(
        new Uint8Array(STAGED_IMAGE_MAX_BYTES + 1),
        "20260830-cover-abcdef.png",
        "image/png",
      ),
    ).toThrow(/3\.5 MiB/);
  });
});
