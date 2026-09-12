// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_UPLOAD_TIMEOUT_MS,
  uploadMediaRequest,
} from "./media-upload-request";

class FakeXhr extends EventTarget {
  static current: FakeXhr;
  upload = new EventTarget();
  timeout = 0;
  status = 201;
  responseText = JSON.stringify({
    data: { path: "source/img/test.png", name: "test.png", sha: "abc" },
  });
  open = vi.fn();
  send = vi.fn();
  getResponseHeader = () => "test-request-id";
  abort = vi.fn(() => this.dispatchEvent(new Event("abort")));
  constructor() {
    super();
    FakeXhr.current = this;
  }
}
beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeXhr));
afterEach(() => vi.unstubAllGlobals());
const file = () => new File(["image"], "test.png", { type: "image/png" });

describe("media upload transport", () => {
  it("sets a deadline and reports ambiguous timeout without retrying", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = uploadMediaRequest(file(), vi.fn(), controller.signal);
    const xhr = FakeXhr.current;
    expect(xhr.timeout).toBe(MEDIA_UPLOAD_TIMEOUT_MS);
    xhr.dispatchEvent(new Event("timeout"));
    await expect(result).rejects.toMatchObject({ resultUnknown: true });
    expect(xhr.send).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
  it("preserves successful responses and upload progress", async () => {
    const progress = vi.fn();
    const result = uploadMediaRequest(
      file(),
      progress,
      new AbortController().signal,
    );
    const xhr = FakeXhr.current;
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", {
        loaded: 5,
        total: 10,
        lengthComputable: true,
      }),
    );
    xhr.dispatchEvent(new Event("load"));
    await expect(result).resolves.toMatchObject({
      path: "source/img/test.png",
    });
    expect(progress).toHaveBeenCalledWith(50);
  });
  it.each(["error", "invalid-json", "server-error"])(
    "marks %s as an unknown result",
    async (event) => {
      const result = uploadMediaRequest(
        file(),
        vi.fn(),
        new AbortController().signal,
      );
      const xhr = FakeXhr.current;
      if (event === "invalid-json") xhr.responseText = "broken";
      if (event === "server-error") xhr.status = 504;
      xhr.dispatchEvent(new Event(event === "error" ? "error" : "load"));
      await expect(result).rejects.toMatchObject({ resultUnknown: true });
    },
  );
  it("keeps validation errors distinct from an uncertain write", async () => {
    const result = uploadMediaRequest(
      file(),
      vi.fn(),
      new AbortController().signal,
    );
    FakeXhr.current.status = 400;
    FakeXhr.current.responseText = JSON.stringify({
      error: { message: "格式错误" },
    });
    FakeXhr.current.dispatchEvent(new Event("load"));
    await expect(result).rejects.toMatchObject({
      resultUnknown: false,
      message: "格式错误（请求 ID：test-request-id）",
    });
  });
  it("aborts an in-flight upload and removes its signal listener", async () => {
    const controller = new AbortController();
    const result = uploadMediaRequest(file(), vi.fn(), controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.current.abort).toHaveBeenCalledTimes(1);
  });
});
