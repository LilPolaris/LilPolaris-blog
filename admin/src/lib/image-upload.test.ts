import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  detectImageContentType,
  normalizeImageBytes,
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
});
