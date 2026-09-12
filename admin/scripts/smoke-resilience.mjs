import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";

const baseUrl = process.env.ADMIN_SMOKE_URL || "http://127.0.0.1:3217";
const url = new URL(baseUrl);
assert.ok(
  ["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol === "http:",
  "Resilience smoke only supports a local HTTP Mock server",
);
const secret = process.env.ADMIN_SMOKE_AUTH_SECRET;
assert.ok(secret, "Set ADMIN_SMOKE_AUTH_SECRET to the local Mock AUTH_SECRET");
const output = process.env.ADMIN_SMOKE_OUTPUT || path.join(os.tmpdir(), "lilpolaris-admin-resilience");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const checks = [];
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const cookieName = "authjs.session-token";
  await context.addCookies([{
    name: cookieName, url: baseUrl, httpOnly: true, sameSite: "Lax",
    value: await encode({ secret, salt: cookieName, token: { sub: "resilience-test", login: "LilPolaris", name: "本地故障验证" } }),
  }]);
  const settings = await context.request.get(`${baseUrl}/api/settings`);
  assert.equal(settings.status(), 200);
  assert.equal((await settings.json()).data.config.adapter, "mock", "Refusing mutations against a real repository");
  await context.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage", "indexedDB"]) {
      Object.defineProperty(window, name, { configurable: true, get() { throw new DOMException("storage-blocked-test", "SecurityError"); } });
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  assert.ok((await page.locator("main").innerText()).trim());
  const theme = page.getByRole("button", { name: /切换到.*主题/ });
  const initialTheme = await theme.getAttribute("aria-label");
  await theme.click();
  assert.notEqual(await theme.getAttribute("aria-label"), initialTheme);
  await theme.click();
  assert.equal(await theme.getAttribute("aria-label"), initialTheme);
  checks.push("Dashboard and both theme toggles work with localStorage/sessionStorage blocked");
  await page.goto(`${baseUrl}/posts/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page.getByRole("button", { name: "Live Preview", exact: true }).click();
  const slug = `resilience-storage-${Date.now()}`;
  await page.getByLabel("文章标题", { exact: true }).fill("Storage resilience browser test");
  await page.locator(".editor-slug-input").fill(slug);
  const content = "# Storage resilience\n\n本地存储不可用时，仍可保存远程草稿。";
  await page.locator(".cm-content").fill(content);
  await page.getByText("本地恢复副本保存失败，请尽快重试远程保存。", { exact: true }).waitFor();
  const savedResponse = page.waitForResponse((response) => response.url().endsWith("/api/posts/bundle") && response.request().method() === "POST");
  await page.locator(".cm-content").press("Control+s");
  assert.equal((await savedResponse).status(), 201);
  await page.waitForURL((current) => /^\/posts\/[^/]+\/edit$/.test(current.pathname));
  await page.locator(".cm-content").waitFor();
  const posts = (await (await context.request.get(`${baseUrl}/api/posts`)).json()).data;
  const saved = posts.find((post) => post.slug === slug);
  assert.equal(saved.kind, "draft");
  const readBack = (await (await context.request.get(`${baseUrl}/api/posts/${saved.id}`)).json()).data;
  assert.equal(readBack.body.trim(), content);
  await page.screenshot({ path: path.join(output, "storage-blocked-editor.png"), fullPage: true });
  await page.getByRole("link", { name: "媒体库", exact: true }).first().click();
  await page.waitForURL("**/media");
  checks.push("Blocked IndexedDB shows recovery warning; editor mode, Ctrl+S, new-draft redirect, API read-back and unmount still work");

  // Speed up the native browser timeout without changing the production setting.
  await page.addInitScript(() => {
    window.__uploadTimeouts = [];
    const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "timeout");
    Object.defineProperty(XMLHttpRequest.prototype, "timeout", {
      configurable: true, get: descriptor.get,
      set(value) { window.__uploadTimeouts.push(value); descriptor.set.call(this, value === 60_000 ? 1_500 : value); },
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  let uploadRequests = 0;
  let firstCommitted;
  let heldRoute;
  await page.route("**/api/media", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    uploadRequests += 1;
    if (uploadRequests !== 1) return route.continue();
    // The Mock repository receives the image, but the response never reaches XHR.
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    firstCommitted = (await response.json()).data;
    heldRoute = route;
  });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const prefix = `resilience-${Date.now()}`;
  await page.locator('input[type="file"]').setInputFiles([
    { name: `${prefix}-lost.png`, mimeType: "image/png", buffer: png },
    { name: `${prefix}-next.png`, mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: "核对后重试", exact: true }).waitFor();
  await page.getByLabel("上传成功", { exact: true }).waitFor();
  assert.equal(uploadRequests, 2);
  assert.deepEqual(await page.evaluate(() => window.__uploadTimeouts), [60_000, 60_000]);
  assert.ok(firstCommitted?.path, "First request must commit before its response is lost");
  await page.getByRole("button", { name: "刷新媒体库", exact: true }).click();
  await page.getByText(/媒体库已刷新，上传队列已保留/).waitFor();
  const media = (await (await context.request.get(`${baseUrl}/api/media`)).json()).data;
  assert.ok(media.some((item) => item.path === firstCommitted.path));
  assert.ok(await page.locator(".media-grid").getByText(firstCommitted.name, { exact: true }).count());
  assert.equal(await page.locator(".upload-task").count(), 2);
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = page.getByRole("button", { name: "核对后重试", exact: true }).click();
  const dialog = await dialogPromise;
  assert.match(dialog.message(), /服务器|上传结果尚未确认/);
  await dialog.dismiss();
  await clickPromise;
  assert.equal(uploadRequests, 2, "Canceling an uncertain retry must not upload again");
  assert.equal((await (await context.request.get(`${baseUrl}/api/media`)).json()).data.length, media.length);
  await page.screenshot({ path: path.join(output, "upload-timeout-recovered.png"), fullPage: true });
  checks.push("Native XHR timeout (60000ms accelerated to1500ms) releases queue; next image succeeds; refresh finds committed lost-response image and keeps queue; canceled retry creates no duplicate");
  if (heldRoute) await heldRoute.abort().catch(() => {});
  assert.deepEqual(errors, [], "No uncaught browser or console errors");
  await writeFile(path.join(output, "resilience-result.json"), JSON.stringify({ baseUrl, adapter: "mock", checks, errors, uploadRequests, configuredTimeoutMs: 60_000, simulatedTimeoutMs: 1_500 }, null, 2));
  console.log(JSON.stringify({ output, checks, errors, uploadRequests }, null, 2));
} finally {
  await browser.close();
}
