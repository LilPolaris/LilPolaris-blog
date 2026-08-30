import { describe, expect, it, vi } from "vitest";
import { AppError, createRequestId, errorResponse } from "@/lib/errors";

describe("API error observability", () => {
  it("keeps a valid upstream request ID", () => {
    expect(createRequestId("request_12345678")).toBe("request_12345678");
  });

  it("returns and logs the same request ID without exposing details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(
      new AppError("UPLOAD_INVALID", "图片无效。", 400, {
        secret: "must-not-be-logged",
      }),
      { operation: "media.stage", requestId: "request_abcdefgh" },
    );

    expect(response.headers.get("x-request-id")).toBe("request_abcdefgh");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "UPLOAD_INVALID",
        requestId: "request_abcdefgh",
      },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).not.toContain("must-not-be-logged");
    log.mockRestore();
  });
});
