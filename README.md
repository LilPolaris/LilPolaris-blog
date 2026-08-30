# LilPolaris-book

这是 Lil Polaris 的 Hexo 博客源码与个人管理后台。公开博客和后台仍是两个独立网站，但共享同一个 GitHub 源码仓库：

- 根目录：Hexo 8 + Butterfly，生成并部署 `https://lilpolaris.github.io`
- `admin/`：Next.js 管理后台，通过 GitHub API 修改 Hexo 源文件

## 目录

```text
.
├─ source/                 # Hexo 文章、资源和页面
├─ themes/                 # Butterfly 主题
├─ scaffolds/              # Hexo 内容模板
├─ .github/workflows/      # Hexo 部署与后台 CI
├─ _config.yml             # Hexo 配置
└─ admin/                  # 独立部署的博客管理后台
```

## 公开博客

```powershell
cd D:\LilPolaris-book
npm ci
npm run server
npm run build
```

`.github/workflows/deploy.yml` 在 `main` 分支中的博客内容发生变化时构建 Hexo，并将 `public/` 推送到 `LilPolaris/LilPolaris.github.io`。纯 `admin/**` 修改不会触发公开博客部署。

部署仓库 Secret：

- `HEXO_DEPLOY_KEY`：公钥对 `LilPolaris.github.io` 具有写权限的 SSH 私钥

文章、草稿和图片只通过管理后台写入 GitHub；本地仓库仅用于代码和主题开发。
`npm run push` 已停用，并会在任何文件或 Git 操作前退出。日常操作参见
[BLOG_GUIDE.md](BLOG_GUIDE.md)。

## 管理后台

```powershell
cd D:\book-back-tool\admin
Copy-Item .env.example .env.local
npm ci
npm run dev
```

打开 `http://localhost:3000`。后台不会直接读写本机的 `source/`，生产和本地登录后均通过服务端 GitHub API 操作远程仓库。若暂时没有 Token，可将 `REPOSITORY_ADAPTER=mock` 使用合成数据验证界面；认证仍不会默认绕过。

### 环境变量

必须填写：

- `GITHUB_TOKEN`：服务端 Fine-grained Personal Access Token
- `AUTH_SECRET`：使用 `npx auth secret` 或安全随机数生成
- `AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`：GitHub OAuth App 凭据
- `ADMIN_GITHUB_LOGIN=LilPolaris`：唯一允许登录的 GitHub 用户

Windows 本机可运行 `admin/scripts/configure-local.ps1`，从已登录的 GitHub CLI 安全读取 Token 并生成仅供 localhost 使用的配置。根目录的“打开博客后台”启动器已经自动执行这一步，无需手动输入命令。

仓库默认值已写入 `admin/.env.example`：

- `GITHUB_OWNER=LilPolaris`
- `GITHUB_REPO=LilPolaris-blog`
- `GITHUB_BRANCH=main`
- `HEXO_POSTS_PATH=source/_posts`
- `HEXO_DRAFTS_PATH=source/_drafts`
- `HEXO_IMAGES_PATH=source/img`
- `PUBLIC_BLOG_URL=https://lilpolaris.github.io`
- `BLOG_TIMEZONE=Asia/Shanghai`
- `GITHUB_WORKFLOW_ID=deploy.yml`

不要使用 `NEXT_PUBLIC_` 暴露任何 Token 或 Secret。真实 `.env*` 已由根 `.gitignore` 排除。

后台默认使用 DeepSeek V4 Flash。API Key 可直接在后台“设置”页面粘贴，
经 `AUTH_SECRET` 加密后保存在当前浏览器的 HttpOnly Cookie 中：

```dotenv
AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_API_KEY=
AI_TIMEOUT_MS=45000
```

如需改回本地 Ollama：

```dotenv
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=qwen3.5:9b
AI_API_KEY=ollama
```

点击“AI 智能生成”时，DeepSeek 会接收当前文章的标题、截断后的正文/摘要，以及历史已发布文章的标题、英文文件名、标签和分类；不会发送其他未发布草稿。结果只回填编辑器，确认后才会保存或发布。模型可复用现有分类体系，也可在确有必要时创建新标签或分类。

### GitHub 权限

Fine-grained Token 仅授权 `LilPolaris/LilPolaris-blog`，建议权限：

- Metadata：Read
- Contents：Read and write
- Actions：Read and write（读取运行记录并触发 `workflow_dispatch`）

OAuth App：

1. GitHub Settings → Developer settings → OAuth Apps → New OAuth App。
2. Homepage URL 填后台地址，本地可填 `http://localhost:3000`。
3. Authorization callback URL 填 `http://localhost:3000/api/auth/callback/github`；部署后改为正式后台域名。
4. 将 Client ID 和 Client Secret 写入服务端环境变量。

OAuth 仅确认登录身份；仓库写入使用单独的服务端 Token。

## 后台功能

- 仪表盘、文章和草稿管理、搜索筛选及分页
- CodeMirror Live Preview 与 Markdown 源码双模式，共享正文、选区、撤销历史和本地恢复
- 标题与英文文件名分离、公开 URL 提示、文章目录、字数/阅读时间和 `/` 快捷命令
- 根据中文标题和历史元数据，用本地 Qwen 或 DeepSeek 生成英文文件名、标签和分类建议
- 图片可直接粘贴或拖入，先保存在 IndexedDB；必要时浏览器压缩并逐图暂存为不可达 Git Blob，最终与正文通过单个 Git Commit 原子提交
- “随笔”等快捷模板自动跳过文章与草稿中的已占用序号；常用标签和多级分类一键添加
- YAML Front Matter 未知字段保留、多级分类和 slug/资源目录同步移动
- IndexedDB 本地恢复、离开提醒、GitHub SHA 冲突提示和强制保存
- 公共媒体与文章资源上传、进度、预览、复制 Markdown 和删除
- 标签合并、标签/分类批量重命名和影响范围确认
- GitHub Actions 运行记录和手动 `workflow_dispatch`
- GitHub OAuth 单用户授权、服务端重复鉴权和签名设置 Cookie
- 首次发布时由服务端写入上海时区的秒级上线时间；撤回后再次发布不会重置

编辑器默认使用 Live Preview；光标进入标题、加粗、链接等位置时会展开
Markdown 标记。`Ctrl+Shift+M` 切换源码模式，`Ctrl+S` 保存草稿，
`Ctrl+Enter` 发布。默认“随笔”模板使用 `rambling-{seq:02}` /
`随笔-{seq:02}`，可在设置页新增、排序或修改（最多 8 个）。

未发布草稿不再占用 `date`。首次发布会同时写入 Hexo 使用的 `date` 和
`first_published_at`；旧文章缺少后者时自动沿用原有 `date`，并在后续保存时懒回填。

原图选择限制为单文件 8 MiB、单篇本地恢复副本总量 32 MiB；这两个数字不是
Vercel Function 的请求上限。超过 3.5 MiB 的 JPG、PNG、WebP 会在浏览器中转为
适合上传的 WebP，再逐张暂存。保存失败时 Blob 与正文恢复副本仍留在浏览器中；
暂存 Git Blob 未挂到分支，不会形成已发布一半的文章。

## 验证

```powershell
cd D:\book-back-tool\admin
npm run lint
npm run typecheck
npm test
npm run build

cd D:\book-back-tool
npm run build
```

`.github/workflows/admin-ci.yml` 会在 `admin/**` 变化时执行同样的后台检查。

## 部署后台

Vercel：

1. 导入 `LilPolaris/LilPolaris-blog`。
2. Root Directory 设置为 `admin`。
3. 填写 `.env.example` 中的服务端环境变量。
4. 将 OAuth callback URL 更新为 `https://后台域名/api/auth/callback/github`。

Vercel Function 的请求体和响应体上限为 4.5 MB。后台不会把整篇文章的多张
图片塞进一个 multipart 请求，而是逐图暂存，最终只发送文章 JSON 和签名 receipt。

Docker：

```powershell
cd D:\book-back-tool\admin
docker build -t lilpolaris-blog-admin .
docker run --env-file .env.local -p 3000:3000 lilpolaris-blog-admin
```

## 安全与排错

- 401：检查登录会话和 OAuth callback URL。
- 403：检查登录用户是否为 `ADMIN_GITHUB_LOGIN`，以及 Token 的 Contents/Actions 权限。
- 404：检查 owner、repo、branch 和 Hexo 路径。
- 409：远程文件已变化；先查看远程内容，再选择重新加载或明确强制保存。
- 422：通常为旧 SHA、目标文件冲突或工作流不支持 `workflow_dispatch`。
- 413：图片未在浏览器端压缩到暂存接口允许的大小；GIF/AVIF 需先手工转换。
- 后台不会记录 Token，不通过 URL 传 Token，也不会把 Token 存入 Local Storage。
- 每个 API 错误都会返回请求 ID；本机日志位于 `admin/.launcher/logs`，Vercel
  环境可用同一请求 ID 查询 Runtime Logs。
- 自动化测试只使用 Mock Adapter，不会修改真实文章或触发真实部署。
