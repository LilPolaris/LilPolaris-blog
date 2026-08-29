import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ADMIN_SMOKE_URL || "http://127.0.0.1:3199";
const edge =
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDirectory = path.join(os.tmpdir(), "lilpolaris-admin-smoke");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: edge,
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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

  await page.goto(`${baseUrl}/posts/new`, { waitUntil: "networkidle" });
  const editor = page.locator(".cm-content");
  await editor.waitFor();
  await editor.click();
  await page.keyboard.type("# 111");
  await page.keyboard.press("Enter");
  await page.keyboard.type("正文");
  await page.locator(".cm-live-h1").waitFor();
  const liveHeading = (await page.locator(".cm-live-h1").innerText()).trim();

  await page.getByRole("button", { name: "源码", exact: true }).click();
  const sourceAfterSwitch = await editor.innerText();
  if (!sourceAfterSwitch.includes("# 111")) {
    throw new Error("Switching to source mode changed the Markdown document.");
  }

  await page.getByRole("button", { name: "Live Preview", exact: true }).click();
  await page
    .locator(".preset-button")
    .filter({ hasText: "随笔" })
    .first()
    .click();
  const title = await page.getByLabel("文章标题").inputValue();
  const slug = await page.getByLabel("英文文件名").inputValue();

  await editor.evaluate(async (element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2166d1";
    context.fillRect(0, 0, 80, 48);
    context.fillStyle = "#ffffff";
    context.font = "20px sans-serif";
    context.fillText("LP", 26, 31);
    const image = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([image], "clipboard.png", { type: "image/png" }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  });
  await page.getByText(/1 张图片已放入本地恢复副本/).waitFor();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const sourceAfterPaste = await editor.innerText();
  if (!sourceAfterPaste.includes("asset_img")) {
    throw new Error("Pasted image was not inserted into Markdown.");
  }
  await page.getByRole("button", { name: "Live Preview", exact: true }).click();
  await page.locator(".cm-live-block-preview img").waitFor();
  const previewLoaded = await page
    .locator(".cm-live-block-preview img")
    .evaluate((image) => image.naturalWidth > 0);

  await page.screenshot({
    fullPage: true,
    path: path.join(outputDirectory, "editor-desktop.png"),
  });
  const lightBackground = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor,
  );
  await page.evaluate(() => {
    localStorage.setItem("admin-theme", "dark");
    document.documentElement.dataset.theme = "dark";
  });
  const darkBackground = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    fullPage: true,
    path: path.join(outputDirectory, "editor-mobile-dark.png"),
  });
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );

  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  const settingsReady = await page
    .getByText("编辑器与快捷模板", { exact: true })
    .isVisible();

  const result = {
    liveHeading,
    sourcePreserved: sourceAfterSwitch.includes("# 111"),
    imagePasteInserted: sourceAfterPaste.includes("asset_img"),
    previewLoaded,
    preset: { title, slug },
    themeChanged: lightBackground !== darkBackground,
    mobileOverflow,
    settingsReady,
    screenshots: outputDirectory,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await browser.close();
}
