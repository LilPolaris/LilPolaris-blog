# LilPolaris 博客日常使用说明书

这份说明写给未来的自己：文章、草稿和图片统一从博客后台发布，不再通过本地 Git 发布内容。

## 现在的结构

- `LilPolaris-blog`：唯一内容源，保存 Markdown、图片、Hexo、主题和后台代码。
- `LilPolaris.github.io`：GitHub Actions 生成的成品站点。
- 本地仓库：只用于开发后台、主题和构建代码，不承担日常文章发布。

发布链路固定为：

```text
浏览器后台 → GitHub 源码仓库 → GitHub Actions → Hexo → GitHub Pages
```

## 新建、修改和发布文章

1. 双击仓库根目录的 `打开博客后台.cmd`。
2. 使用本机 GitHub 身份登录。
3. 在“文章”或“草稿”中编辑内容；图片可粘贴、拖入或从媒体库选择。
4. 点“保存草稿”只保存草稿，点“发布”写入正式文章目录。
5. 到“部署记录”查看 GitHub Actions 状态。

后台通过 GitHub API 直接操作远端仓库，本机是否刚执行过 `git pull` 不影响文章发布。

## 图片规则

- 原图选择上限为单张 8 MiB，单篇本地恢复副本总量为 32 MiB。
- 为适配 Vercel，静态大图会在浏览器中优化后逐张暂存；GIF/AVIF 过大时会提示先手动转换。
- 正文和所有暂存图片最终仍在一个 Git Commit 中出现；任一步失败都不会在分支留下半成品。
- 最终文件名使用 `YYYYMMDD-original-name-shortcode.ext`，只保留安全的小写英文、数字和短横线。

## 本地命令的职责

```powershell
npm run server
npm run build
```

这两条命令只用于本地预览和验证。

`npm run new` 和 `npm run images` 只允许创建开发/主题调试用的本地内容。
`npm run push` 与 `npm run deploy` 已停用，并会在任何文件或 Git 操作前退出。

不要用以下方式发布文章：

```text
npm run push
git add source/_posts
git commit
git push
hexo deploy
```

开发后台或主题时仍可正常使用 Git，但开始前应先确认工作树干净并同步远端。

## 确认自动部署

打开后台“部署记录”，或访问：

```text
https://github.com/LilPolaris/LilPolaris-blog/actions
```

- 绿色对勾：源码已构建并发布。
- 红色叉：点开失败步骤；结合后台显示的请求 ID 和 Vercel/GitHub 日志排查。
- 取消：通常是短时间内连续保存，新运行按并发策略替换了旧运行。

公开站点：

```text
https://lilpolaris.github.io
```

## 评论与统计

评论使用 Utterances，数据位于 `LilPolaris.github.io` 的 GitHub Issues。评论不显示时检查仓库 Issues、Utterances App 授权和页面是否已经完成部署。

访问统计使用 Butterfly 内置的不蒜子配置；主题设置位于 `_config.butterfly.yml`。

## 本地开发验证

```powershell
cd D:\book-back-tool\admin
npm ci
npm run lint
npm run typecheck
npm test
npm run build

cd D:\book-back-tool
npm ci
npm run build
```

自动化测试使用 Mock Adapter，不会写入真实文章仓库。

## 故障速查

- 后台打不开：查看 `admin/.launcher/logs`，不要只检查 3199 是否返回 200。
- 401：检查登录会话和 OAuth callback URL。
- 403：检查管理员 GitHub 用户和服务端 Token 权限。
- 409：远端文章已经变化，重新加载后再保存。
- 413：图片没有在浏览器阶段压到 Vercel 安全范围。
- 内容已保存但网站未更新：查看“部署记录”，不要再次用本地 Git 发布。

## 一句话记忆

```text
写文章和传图只用后台；本地 Git 只开发代码。
```
