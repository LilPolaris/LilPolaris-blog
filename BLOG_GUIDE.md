# LilPolaris 博客日常使用说明书

这份说明写给未来的自己：忘记怎么发博客时，照着做就行。

## 现在的博客结构

这个博客现在分成两个 GitHub 仓库：

- `LilPolaris-blog`：源码仓库，保存文章 Markdown、Hexo 配置、Butterfly 配置、主题子模块、自动部署工作流。
- `LilPolaris.github.io`：成品仓库，保存生成后的 HTML/CSS/JS，也就是浏览器真正访问的网站内容。

日常只需要维护 `LilPolaris-blog` 这份源码。推送源码后，GitHub Actions 会自动生成并发布网站。

## 最常用流程：新写一篇文章并发布

先进入博客文件夹：

```powershell
cd D:\常用\LilPolaris
```

新建文章：

```powershell
npx hexo new post "文章标题"
```

这会在这里生成一个 Markdown 文件：

```text
source/_posts/文章标题.md
```

打开这个文件，编辑开头的文章信息和正文：

```markdown
---
title: 文章标题
date: 2026-04-27 16:00:00
updated: 2026-04-27 16:00:00
tags:
  - 标签1
  - 标签2
categories:
  - 分类
keywords: 关键词1, 关键词2
description: 这是一句话文章摘要，会影响首页摘要和搜索展示。
---

这里开始写正文。
```

写完后，本地预览：

```powershell
npm run server
```

浏览器打开：

```text
http://localhost:4000
```

确认没问题后，在终端按 `Ctrl + C` 停止预览。

发布到网站：

```powershell
git add .
git commit -m "新增文章标题"
git push
```

推送后，GitHub Actions 会自动构建和部署。等几十秒到几分钟，网站会更新。

## 修改旧文章并发布

直接打开对应文件：

```text
source/_posts/xxx.md
```

修改内容后，建议更新 front-matter 里的 `updated` 时间。

本地预览：

```powershell
npm run server
```

确认没问题后发布：

```powershell
git add .
git commit -m "更新 xxx"
git push
```

## 三个 Git 命令是什么意思

```powershell
git add .
```

把当前文件夹里的所有改动加入“准备提交”的列表。

```powershell
git commit -m "这次改动的说明"
```

把准备提交的改动保存成一个版本，并写一句说明。

```powershell
git push
```

把本地版本推到 GitHub 的 `LilPolaris-blog`，并触发自动部署。

## Hexo 命令是什么意思

```powershell
hexo g
```

等于 `hexo generate`，把 Markdown 文章生成 HTML，输出到 `public/`。

```powershell
hexo d
```

等于 `hexo deploy`，把 `public/` 推到 `LilPolaris.github.io`。

```powershell
npm run build
```

项目脚本，等于 `hexo generate`。

```powershell
npm run deploy
```

项目脚本，等于 `hexo deploy`。

现在日常一般不用手动 `hexo g` / `hexo d`，因为 `git push` 后 GitHub Actions 会自动构建和发布。

## 自动部署怎么确认成功

打开源码仓库：

```text
https://github.com/LilPolaris/LilPolaris-blog
```

进入 `Actions` 页面，查看最新的 `Deploy Hexo Site`。

- 绿色对勾：部署成功。
- 红色叉：部署失败，点进去看失败步骤。

如果部署成功，网站仓库 `LilPolaris.github.io` 会被自动更新。

## 评论区说明

评论区使用 Utterances。

评论数据存在 `LilPolaris.github.io` 仓库的 GitHub Issues 里。

如果评论区不显示，优先检查：

1. `LilPolaris.github.io` 仓库是否开启了 Issues。
2. Utterances GitHub App 是否授权了 `LilPolaris.github.io` 仓库。
3. 页面是否已经部署到最新版本。

主题配置在：

```text
_config.butterfly.yml
```

相关配置：

```yaml
comments:
  use: Utterances

utterances:
  repo: LilPolaris/LilPolaris.github.io
```

## 代码块体验

代码块已经做了这些设置：

- 显示复制按钮。
- 显示语言名。
- Mac 风格窗口头。
- 自动换行。
- 长代码块高度限制为 520px。

配置位置：

```text
_config.butterfly.yml
```

相关配置：

```yaml
code_blocks:
  macStyle: true
  height_limit: 520
  word_wrap: true
  copy: true
  language: true
```

## 访问统计

目前使用 Butterfly 内置支持的不蒜子统计：

```yaml
busuanzi:
  site_uv: true
  site_pv: true
  page_pv: true
```

这会显示站点访问量、访客数、文章浏览量。

如果以后想用 Umami 或 Google Analytics，需要先去对应平台创建站点，拿到 `website_id` 或 `G-xxxx` ID，再填到主题配置里。

## 自动部署密钥

自动部署需要两边配置：

1. `LilPolaris.github.io` 仓库的 `Deploy keys` 里添加 public key，并勾选 `Allow write access`。
2. `LilPolaris-blog` 仓库的 `Actions secrets` 里添加 `HEXO_DEPLOY_KEY`，值是 private key 的完整内容。

本地密钥文件在：

```text
.deploy_keys/hexo_deploy
.deploy_keys/hexo_deploy.pub
```

注意：private key 不要发给别人，也不要提交到 GitHub。这个文件夹已经写进 `.gitignore`。

## 如果忘了当前有没有改动

运行：

```powershell
git status
```

常见情况：

- `nothing to commit, working tree clean`：没有未保存改动。
- 出现红色文件：这些文件改了，但还没 `git add`。
- 出现绿色文件：这些文件已经 `git add`，但还没 `git commit`。

## 如果只想本地看看，不发布

```powershell
npm run server
```

打开：

```text
http://localhost:4000
```

只预览不会发布。只有执行 `git push` 后，自动部署才会开始。

## 如果自动部署失败

先打开：

```text
https://github.com/LilPolaris/LilPolaris-blog/actions
```

点最新失败的 `Deploy Hexo Site`，看哪个步骤红了。

常见原因：

- `Install dependencies` 失败：依赖安装问题，通常和 `package-lock.json` 或 npm 网络有关。
- `Build site` 失败：文章 front-matter、Markdown、配置文件有语法错误。
- `Configure deploy key` 失败：`HEXO_DEPLOY_KEY` 没填对。
- `Push generated site` 失败：Deploy key 没加到 `LilPolaris.github.io`，或者没勾 `Allow write access`。

## 一句话记忆

以前是：

```text
hexo g -> hexo d
```

现在是：

```text
写文章 -> git add . -> git commit -m "说明" -> git push
```

GitHub 会自动帮你完成生成和发布。
