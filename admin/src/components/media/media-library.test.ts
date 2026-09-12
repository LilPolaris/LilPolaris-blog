// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  MediaUploadError,
  uploadMediaRequest,
} from "@/lib/media-upload-request";
import { MediaLibrary } from "./media-library";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/client-image", () => ({
  MAX_ORIGINAL_IMAGE_BYTES: 8 * 1024 * 1024,
  validateOriginalImage: vi.fn(),
  prepareImageForUpload: async (file: File) => ({ file }),
}));
vi.mock("@/lib/media-upload-request", async (original) => ({
  ...(await original<typeof import("@/lib/media-upload-request")>()),
  uploadMediaRequest: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("continues the queue after a timeout and requires a deliberate retry of the unknown result", async () => {
  const upload = vi.mocked(uploadMediaRequest);
  const asset = {
    id: "second",
    path: "source/img/second.png",
    name: "second.png",
    sha: "abc",
    size: 10,
    scope: "global" as const,
  };
  upload
    .mockRejectedValueOnce(new MediaUploadError("超时，请核对媒体库", true))
    .mockResolvedValue(asset);
  const { container } = render(
    createElement(MediaLibrary, { initialMedia: [], limitMb: 8 }),
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["one"], "one.png", { type: "image/png" }),
        new File(["two"], "two.png", { type: "image/png" }),
      ],
    },
  });
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  await screen.findByLabelText("上传成功");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [asset] }) });
  vi.stubGlobal("fetch", fetch);
  fireEvent.click(screen.getByRole("button", { name: "刷新媒体库" }));
  await screen.findByText(/媒体库已刷新，上传队列已保留/);
  expect(screen.getByRole("button", { name: "核对后重试" })).toBeTruthy();
  expect(upload).toHaveBeenCalledTimes(2);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "核对后重试" }));
  expect(confirm).toHaveBeenCalled();
  expect(upload).toHaveBeenCalledTimes(2);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "核对后重试" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
});
