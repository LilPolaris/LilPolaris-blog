# LilPolaris Blog Admin

独立部署的个人 Hexo 管理后台。完整配置、权限和部署步骤见仓库根目录 [README](../README.md)。

编辑器默认提供 Obsidian 风格 Live Preview，也可切换到完整 Markdown
源码。支持直接粘贴/拖入图片、IndexedDB 离线恢复、正文与图片原子提交、
快捷文章模板及常用标签分类建议。默认编辑模式和最多 8 个模板可直接在
“设置”页面调整，无需修改配置文件。

为适配 Vercel Function 的 4.5 MB payload 上限，静态大图会先在浏览器中
优化到 3.5 MiB 内，再逐张暂存为未挂分支的 Git Blob。最终保存只发送
文章 JSON 和签名 receipt，并通过一次 Git Commit 同时公开正文与所有图片。
原图上限 8 MiB、恢复副本总量 32 MiB 仅是浏览器本地限制。

GitHub 写入统一经过 Repository Adapter 的中央保护。Vercel Preview 必须将
`GITHUB_BRANCH` 设为非 `main` 的专用分支；Preview 中的 `main` 永远禁止写入，
即使误设 `CONTENT_WRITE_POLICY=production-main` 也会返回 403。Production/OAuth
只有显式设置该值才能写 `main`。非 Vercel 的本机 `local-cli` 和 Mock Adapter
不需要生产解锁变量。Preview 在任何分支上都不能触发部署工作流。

编辑器的“AI 智能生成”会根据中文标题、当前正文和历史已发布文章元数据回填英文文件名、
标签和分类，默认连接 DeepSeek V4 Flash。API Key 可在“设置”页面粘贴，
加密后保存在 HttpOnly Cookie 中；本地 Ollama 的切换示例见 `.env.example`。

草稿首次发布时，服务端会按 `Asia/Shanghai` 写入秒级 `date` 和
`first_published_at`。撤回再发布沿用第一次上线时间，普通更新只刷新 `updated`。

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

常用验证：

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

文章列表支持状态数量、分类与标签筛选、一键清除筛选。“更多操作”中的
“复制为草稿”会复制正文与关联资源，清除原文的发布时间与自定义永久链接；
副本需要单独发布。

本地综合浏览器验证使用专用 Mock 服务和测试会话密钥，不需要真实 GitHub 身份：

```powershell
# 在独立测试工作区运行；仅供本机 Mock 服务使用。
$env:REPOSITORY_ADAPTER="mock"
$env:AUTH_SECRET="local-admin-quality-test-only-2026"
npm run build
npm run start -- --hostname 127.0.0.1 --port 3217

# 另开终端，密钥须与上面的本地测试服务一致。
$env:ADMIN_SMOKE_URL="http://127.0.0.1:3217"
$env:ADMIN_SMOKE_AUTH_SECRET="local-admin-quality-test-only-2026"
npm run smoke:quality
npm run smoke:resilience
```

脚本先验证本机地址、登录状态和 Mock 配置，然后检查文章列表、复制草稿、
编辑保存、各管理页面和手机导航。结果及截图保存在系统临时目录
`lilpolaris-admin-quality`。支持用 `ADMIN_SMOKE_OUTPUT` 指定输出目录，
用 `EDGE_PATH` 指定浏览器路径。测试生成的浏览器会话文件仅用于该 Mock 服务。

`smoke:resilience` 使用相同的本机地址、Mock 配置和会话检查，验证浏览器禁用
localStorage/sessionStorage/IndexedDB 后的编辑保存，以及图片已写入但响应丢失时的
上传队列恢复。测试把原生 XHR 的 60 秒超时加速为 1.5 秒；产品仍使用 60 秒。
结果及截图默认保存在系统临时目录 `lilpolaris-admin-resilience`。

浏览器存储不可用时，主题、编辑器模式和一次性提示退化为当前页面内存保存；
刷新页面后可能重置。文章恢复副本仍由 IndexedDB 管理，失败会提示及时远程保存。
上传结果不确定时，请先点击“刷新媒体库”核对已上传图片，再决定是否重试；
刷新会保留上传队列，系统不会自动重传结果不确定的图片。

Vercel 的忽略构建步骤比较 `VERCEL_GIT_PREVIOUS_SHA` 与当前提交的整个 `admin/`
目录，避免一次推送多个提交或合并提交时漏掉后台修改。没有可用基线、浅克隆缺少
历史或 Git 检查失败时均执行构建。

完整上传 smoke 必须连接 Mock 服务；脚本会先读取设置并拒绝对真实仓库执行：

```powershell
$env:REPOSITORY_ADAPTER="mock"
npm run start -- --hostname 127.0.0.1 --port 3201

# 另开终端
$env:ADMIN_SMOKE_URL="http://127.0.0.1:3201"
npm run smoke:upload
```

Windows 日常启动请双击仓库根目录的“打开博客后台.cmd”。启动器使用内容
指纹和版本化 standalone 制品；运行日志保存在被 Git 忽略的
`admin/.launcher/logs`。
