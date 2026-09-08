import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";

const baseUrl = process.env.ADMIN_SMOKE_URL || "http://127.0.0.1:3217";
const url = new URL(baseUrl);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.protocol !== "http:"
) {
  throw new Error("Quality smoke only supports a local HTTP Mock server.");
}
const secret = process.env.ADMIN_SMOKE_AUTH_SECRET;
if (!secret)
  throw new Error(
    "Set ADMIN_SMOKE_AUTH_SECRET to the isolated Mock server's AUTH_SECRET.",
  );
const output =
  process.env.ADMIN_SMOKE_OUTPUT ||
  path.join(os.tmpdir(), "lilpolaris-admin-quality");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH ||
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const errors = [];
const checks = [];
const copySlug = `quality-copy-${Date.now()}`;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const cookieName = "authjs.session-token";
  await context.addCookies([
    {
      name: cookieName,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
      value: await encode({
        secret,
        salt: cookieName,
        token: { sub: "quality-test", login: "LilPolaris", name: "本地验证" },
      }),
    },
  ]);
  const settings = await context.request.get(`${baseUrl}/api/settings`);
  assert.equal(settings.status(), 200, "Local test session must authenticate");
  const settingsData = (await settings.json()).data;
  assert.equal(
    settingsData.config.adapter,
    "mock",
    "Refusing mutations against a real repository",
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`${message.text()} ${message.location().url}`);
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") await dialog.accept(copySlug);
    else await dialog.accept();
  });
  const postResponse = await context.request.get(`${baseUrl}/api/posts`);
  const originalPosts = (await postResponse.json()).data;
  const titles = [
    "把博客写作变成日常习惯",
    "读书笔记：从问题开始",
    "给文章加上清晰的结构",
    "一次周末散步的记录",
    "整理我的知识库",
    "Markdown 写作小技巧",
    "九月的阅读计划",
    "从草稿到发布的检查",
    "关于学习的一点想法",
    "笔记里的几个好问题",
    "搭建个人博客的收获",
  ];
  for (const [index, title] of titles.entries()) {
    const slug = `quality-sample-${index}`;
    if (originalPosts.some((post) => post.slug === slug)) continue;
    const result = await context.request.post(`${baseUrl}/api/posts`, {
      data: {
        kind: index % 3 ? "post" : "draft",
        slug,
        body: "# 阅读与记录\n\n这是本地 Mock 验证内容。",
        frontMatter: {
          title,
          slug,
          draft: index % 3 === 0,
          tags: ["写作", "笔记", "日常", "阅读"],
          categories: [["随笔"]],
          layout: "post",
          date: "",
          firstPublishedAt: "",
          updated: "",
          excerpt: "",
          cover: "",
          permalink: "",
        },
      },
    });
    assert.equal(result.status(), 201, await result.text());
  }
  await page.goto(`${baseUrl}/posts`, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".post-table tbody tr").count(), 10);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  assert.match(page.url(), /page=2/);
  await page.getByLabel("搜索文章").fill("不存在的文章关键词");
  await page.getByText("没有匹配结果", { exact: true }).waitFor();
  assert.ok(!page.url().includes("page=2"));
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page
    .getByRole("group", { name: "文章状态" })
    .getByRole("button", { name: /^已发布/ })
    .click();
  assert.equal(
    await page.locator(".post-table tbody .badge.warning").count(),
    0,
  );
  await page.getByLabel("搜索文章").fill("欢迎来到");
  await page
    .getByRole("button", { name: "更多操作：欢迎来到 Lil Polaris" })
    .click();
  const copyResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/posts/actions") &&
      response.request().method() === "POST",
  );
  await page.getByRole("menuitem", { name: "复制为草稿" }).click();
  assert.equal((await copyResponse).status(), 200);
  const after = (
    await (await context.request.get(`${baseUrl}/api/posts`)).json()
  ).data;
  const copied = after.find((post) => post.slug === copySlug);
  assert.equal(copied.kind, "draft");
  assert.equal(copied.path, `source/_drafts/${copySlug}.md`);
  const original = originalPosts.find(
    (post) => post.slug === "welcome-to-lilpolaris",
  );
  assert.equal(
    after.find((post) => post.path === original.path).sha,
    original.sha,
  );
  checks.push(
    "Pagination, search, status filters, clear filters, copy-as-draft and unchanged original",
  );
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.screenshot({
    path: path.join(output, "posts-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换到暗色主题" }).click();
  await page.screenshot({
    path: path.join(output, "posts-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换到亮色主题" }).click();

  await page.goto(`${baseUrl}/posts/${copied.id}/edit`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const content =
    "# 真标题\n\n```markdown\n# 示例代码\n```\n\n小节\n---\n\n## **重点**\n\n最后一段。";
  const editor = page.locator(".cm-content");
  await editor.fill(content);
  await page.waitForFunction(
    () => document.querySelectorAll(".editor-outline button").length === 3,
  );
  assert.ok(
    !(await page.locator(".editor-outline").innerText()).includes("示例代码"),
  );
  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/posts/bundle") &&
      response.request().method() === "POST",
  );
  await editor.press("Control+s");
  assert.equal((await saveResponse).status(), 200);
  await page.getByText("已保存到 GitHub", { exact: true }).waitFor();
  const saved = (
    await (
      await context.request.get(`${baseUrl}/api/posts/${copied.id}`)
    ).json()
  ).data;
  assert.equal(saved.body.trim(), content);
  assert.equal(saved.kind, "draft");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".cm-content").waitFor();
  await page.screenshot({
    path: path.join(output, "editor-desktop.png"),
    fullPage: true,
  });
  checks.push(
    "Parsed editor outline, Ctrl+S saves a draft, API content read-back, reload",
  );

  for (const route of [
    "/dashboard",
    "/drafts",
    "/media",
    "/taxonomy",
    "/deployments",
    "/settings",
  ]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    assert.ok(
      (await page.locator("main").innerText()).trim().length > 0,
      route,
    );
    assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0, route);
  }
  checks.push("All seven admin sections load without an error overlay");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/posts`, { waitUntil: "networkidle" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile viewport overflow",
  );
  await page.screenshot({
    path: path.join(output, "posts-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "草稿", exact: true })
    .click();
  await page.waitForURL("**/drafts");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push("390px mobile layout and drawer navigation");
  assert.deepEqual(errors, [], "Browser console and page errors");
  await context.storageState({
    path: path.join(output, "mock-browser-state.json"),
  });
  await writeFile(
    path.join(output, "quality-result.json"),
    JSON.stringify({ baseUrl, adapter: "mock", checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ output, checks, errors }, null, 2));
} finally {
  await browser.close();
}
