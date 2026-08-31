import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ADMIN_SMOKE_URL || "http://127.0.0.1:3201";
const edge =
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDirectory = path.join(os.tmpdir(), "lilpolaris-admin-upload-smoke");
await mkdir(outputDirectory, { recursive: true });

function isTrackedApi(url) {
  return (
    url.includes("/api/posts/media/stage") ||
    url.includes("/api/posts/bundle")
  );
}

const browser = await chromium.launch({ executablePath: edge, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const apiResponses = [];
  const mediaResponses = [];
  const apiRequestSizes = [];
  const apiRequestPromises = [];
  const apiResponsePromises = [];
  page.on("request", (request) => {
    if (!isTrackedApi(request.url())) return;
    apiRequestPromises.push(
      (async () => {
        const header = await request.headerValue("content-length");
        apiRequestSizes.push({
          bytes:
            request.postDataBuffer()?.byteLength ||
            Number.parseInt(header || "", 10) ||
            0,
          url: request.url(),
        });
      })(),
    );
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/media/content")) {
      mediaResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
    if (!isTrackedApi(response.url())) return;
    apiResponsePromises.push(
      (async () => {
        let body;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
        apiResponses.push({
          body,
          requestId: response.headers()["x-request-id"],
          status: response.status(),
          url: response.url(),
        });
      })(),
    );
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const localLogin = page.getByRole("button", {
    name: /使用本机 GitHub 身份进入/,
  });
  if (await localLogin.isVisible()) {
    await Promise.all([
      page.waitForURL("**/dashboard"),
      localLogin.click(),
    ]);
  }

  const adapter = await page.evaluate(async () => {
    const response = await fetch("/api/settings");
    const payload = await response.json();
    return payload?.data?.config?.adapter;
  });
  if (adapter !== "mock") {
    throw new Error(
      "Upload smoke refuses to mutate a non-Mock repository. Start the server with REPOSITORY_ADAPTER=mock.",
    );
  }

  await page.goto(`${baseUrl}/posts/new`, { waitUntil: "networkidle" });
  const title = `Mock 大图上传验证 ${Date.now()}`;
  const slug = `mock-large-${Date.now()}`;
  await page.getByLabel("文章标题").fill(title);
  await page.getByLabel("英文文件名").fill(slug);
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.type("large image body");

  const sourceImageSize = await editor.evaluate(async (element) => {
    const width = 1400;
    const height = 1100;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);
    let state = 0x12345678;
    for (let index = 0; index < image.data.length; index += 4) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      image.data[index] = state & 255;
      image.data[index + 1] = (state >>> 8) & 255;
      image.data[index + 2] = (state >>> 16) & 255;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], "Large Mock Image.PNG", { type: "image/png" }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    return blob.size;
  });
  if (
    sourceImageSize <= Math.floor(3.5 * 1024 * 1024) ||
    sourceImageSize > 8 * 1024 * 1024
  ) {
    throw new Error(
      `Generated source image did not exercise compression: ${sourceImageSize}`,
    );
  }

  await page.getByText(/1 张图片已放入本地恢复副本/).waitFor();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page
    .getByText(/正文与图片已在同一个 Git Commit 中保存为草稿/)
    .waitFor({ timeout: 60_000 });
  await Promise.all([...apiRequestPromises, ...apiResponsePromises]);
  await page.screenshot({
    fullPage: true,
    path: path.join(outputDirectory, "saved-large-draft.png"),
  });

  await page.goto(`${baseUrl}/drafts`, { waitUntil: "networkidle" });
  const draftVisible = await page.getByText(title, { exact: true }).isVisible();
  await page.getByText(title, { exact: true }).click();
  await page.waitForURL("**/posts/*/edit?**");
  const previewImage = page.locator(".cm-live-block-preview img").first();
  await previewImage.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".cm-live-block-preview img");
    return image instanceof HTMLImageElement && image.naturalWidth > 0;
  });
  const previewSize = await previewImage.evaluate((image) => ({
    height: image.naturalHeight,
    width: image.naturalWidth,
  }));

  const media = await page.evaluate(async () => {
    const response = await fetch("/api/media");
    return (await response.json()).data;
  });
  const stage = apiResponses.find((item) =>
    item.url.includes("/api/posts/media/stage"),
  );
  const bundle = apiResponses.find((item) =>
    item.url.includes("/api/posts/bundle"),
  );
  const uploaded = bundle?.body?.data?.uploadedMedia?.[0];
  const stageRequest = apiRequestSizes.find((item) =>
    item.url.includes("/api/posts/media/stage"),
  );
  const bundleRequest = apiRequestSizes.find((item) =>
    item.url.includes("/api/posts/bundle"),
  );
  const result = {
    bundleCount: apiResponses.filter((item) =>
      item.url.includes("/api/posts/bundle"),
    ).length,
    bundleRequestId: bundle?.requestId,
    bundleRequestBytes: bundleRequest?.bytes,
    bundleStatus: bundle?.status,
    draftVisible,
    mediaVisible: media.some((item) => item.name === uploaded?.name),
    mediaResponses,
    previewSize,
    sourceImageSize,
    stageCount: apiResponses.filter((item) =>
      item.url.includes("/api/posts/media/stage"),
    ).length,
    stageName: stage?.body?.preparedName,
    stageRequestId: stage?.requestId,
    stageRequestBytes: stageRequest?.bytes,
    stageSize: stage?.body?.size,
    stageStatus: stage?.status,
    uploadedName: uploaded?.name,
    uploadedSize: uploaded?.size,
  };
  if (
    result.stageCount !== 1 ||
    result.bundleCount !== 1 ||
    result.stageStatus !== 201 ||
    result.bundleStatus !== 201 ||
    !result.stageRequestId ||
    !result.bundleRequestId ||
    result.stageRequestBytes >= 4.5 * 1_000_000 ||
    result.bundleRequestBytes >= 4.5 * 1_000_000 ||
    !/^\d{8}-large-mock-image-[0-9a-f]{6}\.webp$/.test(
      result.uploadedName || "",
    ) ||
    result.uploadedSize > Math.floor(3.5 * 1024 * 1024) ||
    !result.draftVisible ||
    !result.mediaVisible ||
    result.mediaResponses.some((item) => item.status >= 400) ||
    result.previewSize.width !== 1400 ||
    result.previewSize.height !== 1100
  ) {
    throw new Error(`Upload smoke failed: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await browser.close();
}
