import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapWithConcurrency,
  MAX_PREPARED_IMAGE_BYTES,
  MAX_PREPARED_IMAGE_EDGE,
  prepareImageForUpload,
} from "@/lib/client-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client image preparation", () => {
  it("keeps small supported images unchanged", async () => {
    const file = new File([new Uint8Array(32)], "photo.PNG", {
      type: "image/png",
    });
    const prepared = await prepareImageForUpload(file);
    expect(prepared.file).toBe(file);
    expect(prepared.compressed).toBe(false);
  });

  it("rejects oversized GIF and AVIF without changing the original", async () => {
    const bytes = new Uint8Array(MAX_PREPARED_IMAGE_BYTES + 1);
    const gif = new File([bytes], "animation.gif", { type: "image/gif" });
    await expect(prepareImageForUpload(gif)).rejects.toThrow("GIF");
    expect(gif.name).toBe("animation.gif");
    expect(gif.size).toBe(MAX_PREPARED_IMAGE_BYTES + 1);
  });

  it("shrinks a large static image to WebP within the edge and body limits", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      height: 0,
      width: 0,
      getContext: vi.fn(() => ({ clearRect: vi.fn(), drawImage })),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(128)], { type: "image/webp" })),
      ),
    };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      close,
      height: 2500,
      width: 5000,
    })));
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    const file = new File(
      [new Uint8Array(MAX_PREPARED_IMAGE_BYTES + 1)],
      "Wide.Photo.PNG",
      { type: "image/png", lastModified: 123 },
    );

    const prepared = await prepareImageForUpload(file);
    expect(prepared.compressed).toBe(true);
    expect(prepared.file.name).toBe("Wide.Photo.webp");
    expect(prepared.file.type).toBe("image/webp");
    expect(prepared.file.size).toBeLessThanOrEqual(MAX_PREPARED_IMAGE_BYTES);
    expect(Math.max(canvas.width, canvas.height)).toBe(
      MAX_PREPARED_IMAGE_EDGE,
    );
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("limits concurrent work and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(3);
  });
});
