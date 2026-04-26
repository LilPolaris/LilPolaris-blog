---
title: 如何搭建个人博客
date: 2026-03-22 22:10:28
updated: 2026-03-22 22:10:28
tags:
  - Hexo
  - 博客搭建
  - GitHub Pages
  - Butterfly
categories:
  - 教程
  - 分享
keywords: Hexo, 博客搭建, GitHub Pages, Butterfly, 教程
description: 从零开始搭建 Hexo 博客，并部署到 GitHub Pages 的完整入门教程。
---
# 从零开始用 HEXO 搭建个人博客 —— 完整教程

> 本教程面向零基础用户，手把手教你用 Hexo 框架搭建一个免费的个人博客，并部署到 GitHub Pages 上。

---

## 什么是 Hexo？

- **官方网站：** https://hexo.io/zh-cn/

Hexo 是一个快速、简洁且高效的静态博客框架，由台湾开发者用 Node.js 编写。

### Hexo 的优点

1. **速度极快** —— 基于 Node.js，生成上百篇文章只需几秒钟
2. **部署简单** —— 一条命令即可部署到 GitHub Pages，完全免费托管
3. **用 Markdown 写作** —— 专注于内容本身，不需要操心排版
4. **主题丰富** —— 社区有数百款精美主题（Next、Butterfly、Fluid 等），开箱即用
5. **插件生态完善** —— 搜索、SEO、RSS、评论系统等功能都有成熟插件
6. **纯静态网站** —— 不需要服务器和数据库，安全性高、无运维成本
7. **中文社区活跃** —— 大量中文教程和文档，遇到问题容易找到解决方案

---

## 一、环境准备与安装

在开始之前，我们需要安装三样东西：**Node.js**、**Git** 和 **Hexo**。

### 1.1 安装 Node.js

Hexo 基于 Node.js 运行，所以首先要安装它。

- **官网下载地址：** https://nodejs.org/zh-cn
- 进入官网后，下载 **LTS（长期支持版）**，这是最稳定的版本
- 下载后双击安装包，**一路点 Next 即可**，所有选项保持默认

**验证安装是否成功：**

打开终端（Windows 用户按 `Win + R`，输入 `cmd` 回车），输入以下命令：

```bash
node -v
npm -v
```

如果分别显示出版本号（如 `v20.x.x` 和 `10.x.x`），说明安装成功。

### 1.2 安装 Git

Git 是版本管理工具，后续部署博客到 GitHub 时需要用到。

- **官网下载地址：** https://git-scm.com/downloads
- 点击 **Windows** 版本下载
- 安装时同样**一路 Next 保持默认即可**

> **提示：** 安装完 Git 后会**自带 Git Bash 终端**，不需要单独下载。安装完成后，在桌面或任意文件夹内右键，如果看到 **"Git Bash Here"** 选项，说明安装成功。后续教程中的命令都推荐在 Git Bash 中执行。

**验证安装：**

在终端中输入：

```bash
git --version
```

显示类似 `git version 2.x.x` 即为成功。

### 1.3 安装 Hexo

Node.js 和 Git 都准备好之后，就可以安装 Hexo 了。

打开终端（推荐使用 Git Bash），输入以下命令全局安装 Hexo：

```bash
npm install -g hexo-cli
```

> **注意：** 如果下载速度很慢，可以先切换为国内镜像源：
>
> ```bash
> npm config set registry https://registry.npmmirror.com
> ```
>
> 然后再执行上面的安装命令。

**验证安装：**

```bash
hexo -v
```

显示 Hexo 版本信息即为安装成功。

### 1.4 环境准备小结

到这里，你应该已经成功安装了以下三样工具：

| 工具     | 作用                     | 验证命令        |
| -------- | ------------------------ | --------------- |
| Node.js  | Hexo 的运行环境          | `node -v`       |
| Git      | 版本管理 & 部署到 GitHub | `git --version` |
| Hexo CLI | 创建和管理博客           | `hexo -v`       |

全部验证通过后，进入下一步！

---

## 二、创建 Hexo 博客项目

### 2.1 初始化博客

打开 Git Bash，`cd` 到你想存放博客的目录（比如 D 盘），然后执行：

```bash
cd /d
hexo init my-blog
cd my-blog
npm install
```

> **说明：**
>
> - `hexo init my-blog`：创建一个名为 `my-blog` 的博客文件夹（名字可以自定义）
> - `npm install`：安装博客所需的依赖包

### 2.2 项目目录结构

初始化完成后，`my-blog` 文件夹内的结构如下：

```
my-blog/
├── _config.yml      # 博客的核心配置文件（最重要！）
├── package.json     # 项目依赖信息
├── scaffolds/       # 模板文件夹（新建文章时的模板）
├── source/          # 资源文件夹（你写的文章都放在这里）
│   └── _posts/      # 文章存放目录
└── themes/          # 主题文件夹
```

**最常用的：**

- `_config.yml` —— 修改博客名称、主题、部署等所有配置
- `source/_posts/` —— 你的文章（Markdown 文件）都放在这里

### 2.3 本地预览博客

在 `my-blog` 目录下执行：

```bash
hexo generate
hexo server
```

也可以简写为：

```bash
hexo g
hexo s
```

> **说明：**
>
> - `hexo g`：生成静态网页文件
> - `hexo s`：启动本地预览服务器

执行后终端会提示：

```
INFO  Hexo is running at http://localhost:4000/
```

打开浏览器，访问 **http://localhost:4000/** ，你就能看到博客的初始页面了！

> **提示：** 预览完毕后，在终端按 `Ctrl + C` 即可停止服务器。

---

## 三、博客基础配置与主题

### 3.1 修改 `_config.yml` 核心配置

用任意文本编辑器（推荐 VS Code：https://code.visualstudio.com/ ）打开博客根目录下的 `_config.yml`，找到以下字段并修改：

```yaml
# 站点信息
title: 我的个人博客          # 博客标题
subtitle: 记录学习与生活      # 副标题
description: 一个用Hexo搭建的博客  # 站点描述（用于SEO）
keywords: 博客,Hexo           # 关键词
author: 你的名字              # 作者名
language: zh-CN               # 语言设为中文
timezone: Asia/Shanghai        # 时区设为中国

# 网址（部署到 GitHub Pages 后再改，现在先不动）
url: http://yourname.github.io
```

> **注意：** YAML 格式中，冒号 `:` 后面必须有**一个空格**，否则会报错。

### 3.2 安装主题

Hexo 默认主题是 `landscape`，比较简陋。推荐更换为更美观的主题。

以下是几个热门主题及其地址：

| 主题      | 风格               | GitHub 地址                                       |
| --------- | ------------------ | ------------------------------------------------- |
| Next      | 简洁优雅（最流行） | https://github.com/next-theme/hexo-theme-next     |
| Butterfly | 美观功能丰富       | https://github.com/jerryc127/hexo-theme-butterfly |
| Fluid     | 清新 Material 风   | https://github.com/fluid-dev/hexo-theme-fluid     |

**以 Next 主题为例，安装步骤：**

在博客根目录（`my-blog`）下打开 Git Bash，执行：

```bash
git clone https://github.com/next-theme/hexo-theme-next themes/next
```

这会将 Next 主题下载到 `themes/next` 文件夹中。

### 3.3 启用主题

打开博客根目录下的 `_config.yml`，找到 `theme` 字段，修改为：

```yaml
theme: next
```

> 默认值是 `theme: landscape`，改成你下载的主题名即可。

保存后重新预览：

```bash
hexo clean
hexo g
hexo s
```

刷新浏览器 http://localhost:4000/ ，就能看到新主题的效果了！

> **说明：** `hexo clean` 会清除之前生成的缓存文件，更换主题后建议先执行一次。

### 3.4 主题基础配置（以 Next 为例）

打开 `themes/next/_config.yml`（注意是**主题文件夹**里的配置文件，不是博客根目录的），可以修改：

**选择主题样式：**

Next 有 4 种内置样式，找到 `scheme` 字段，取消你想要的样式前面的 `#` 注释：

```yaml
# scheme: Muse        # 默认，紧凑型
# scheme: Mist        # 单栏，清爽
scheme: Pisces         # 双栏，推荐
# scheme: Gemini       # 双栏，带阴影
```

**设置头像：**

将你的头像图片放到 `themes/next/source/images/` 目录下（比如命名为 `avatar.jpg`），然后在主题配置文件中找到：

```yaml
avatar:
  url: /images/avatar.jpg
  rounded: true        # true 为圆形头像
```

**开启菜单导航：**

找到 `menu` 部分，取消注释即可启用对应页面：

```yaml
menu:
  home: / || fa fa-home
  about: /about/ || fa fa-user
  tags: /tags/ || fa fa-tags
  categories: /categories/ || fa fa-th
  archives: /archives/ || fa fa-archive
```

> **提示：** `about`、`tags`、`categories` 这些页面需要手动创建，下一章会讲到。

### 3.5 主题安装与配置（以 Butterfly 为例）

Butterfly 是目前最受欢迎的 Hexo 主题之一，功能丰富、界面美观，非常适合个人博客。

- **GitHub 地址：** https://github.com/jerryc127/hexo-theme-butterfly
- **官方文档：** https://butterfly.js.org/

#### 3.5.1 安装 Butterfly

在博客根目录（`my-blog`）下打开 Git Bash，执行：

```bash
git clone -b master https://github.com/jerryc127/hexo-theme-butterfly.git themes/butterfly
```

然后安装 Butterfly 需要的渲染插件（必须装，否则会报错）：

```bash
npm install hexo-renderer-pug hexo-renderer-stylus --save
```

#### 3.5.2 启用 Butterfly

打开博客根目录下的 `_config.yml`，将 `theme` 改为：

```yaml
theme: butterfly
```

预览效果：

```bash
hexo clean
hexo g
hexo s
```

打开 http://localhost:4000/ 即可看到 Butterfly 主题。

#### 3.5.3 Butterfly 基础配置

将 `themes/butterfly/_config.yml` 复制一份到博客根目录，并重命名为 `_config.butterfly.yml`：

```bash
cp themes/butterfly/_config.yml _config.butterfly.yml
```

> **为什么要这样做？** 直接修改主题文件夹内的配置，更新主题时会被覆盖。复制到根目录后，Hexo 会优先读取这个文件，更新主题也不会丢失你的配置。

以下所有修改都在博客根目录的 `_config.butterfly.yml` 中进行：

**设置导航菜单：**

```yaml
menu:
  首页: / || fas fa-home
  归档: /archives/ || fas fa-archive
  标签: /tags/ || fas fa-tags
  分类: /categories/ || fas fa-folder-open
  关于: /about/ || fas fa-heart
```

**设置头像和站点信息：**

将头像图片放到 `source/img/` 目录下（没有就新建），然后修改：

```yaml
avatar:
  img: /img/avatar.jpg    # 头像路径
  effect: true             # true 开启头像旋转动画

# 社交链接（显示在侧边栏）
social:
  fab fa-github: https://github.com/你的用户名 || Github
  fas fa-envelope: mailto:你的邮箱 || Email
```

**设置主页封面图：**

```yaml
# 首页文章封面图
cover:
  index_enable: true
  default_cover:
    - https://picsum.photos/600/400?random=1
    - https://picsum.photos/600/400?random=2
    - https://picsum.photos/600/400?random=3
```

> **说明：** 以上使用了随机图片服务作为示例，你也可以换成自己的图片链接。

**设置页脚：**

```yaml
footer:
  owner:
    enable: true
    since: 2025           # 博客起始年份
  custom_text: 欢迎来到我的博客！   # 自定义页脚文字
```

**开启夜间模式按钮：**

```yaml
darkmode:
  enable: true
  button: true            # 显示切换按钮
  autoChangeMode: false
```

**开启本地搜索功能（可选）：**

先安装搜索插件：

```bash
npm install hexo-generator-searchdb --save
```

然后在 `_config.butterfly.yml` 中开启：

```yaml
local_search:
  enable: true
```

同时在博客根目录的 `_config.yml` 中添加：

```yaml
search:
  path: search.xml
  field: post
  content: true
```

#### 3.5.4 Butterfly 配置小结

修改完成后，执行以下命令查看效果：

```bash
hexo clean
hexo g
hexo s
```

> **提示：** Butterfly 的完整配置项非常多，以上只是最常用的基础配置。更多高级配置请参考官方文档：https://butterfly.js.org/

---

## 四、写文章与管理内容

### 4.1 创建新文章

在博客根目录下打开 Git Bash，执行：

```bash
hexo new "我的第一篇博客"
```

执行后会在 `source/_posts/` 目录下生成一个文件：`我的第一篇博客.md`。

用文本编辑器打开这个文件，你会看到：

```markdown
---
title: 我的第一篇博客
date: 2025-01-01 12:00:00
tags:
---
```

`---` 之间的部分叫做 **Front-matter**，是文章的元信息。`---` 下方就是正文，用 Markdown 语法来写。

### 4.2 Front-matter 参数详解

Front-matter 用于定义文章的属性，常用参数如下：

```markdown
---
title: 我的第一篇博客         # 文章标题
date: 2025-01-01 12:00:00    # 发布日期
updated: 2025-01-02 08:00:00 # 更新日期（可选）
tags:                         # 标签（可以多个）
  - Hexo
  - 教程
categories:                   # 分类
  - 技术
cover: /img/cover.jpg         # 文章封面图（Butterfly 主题支持）
description: 这是我的第一篇博客文章  # 文章摘要描述
---
```

> **标签 vs 分类的区别：**
>
> - **标签（tags）**：一篇文章可以有多个标签，标签之间没有层级关系
> - **分类（categories）**：有层级关系，一篇文章通常只属于一个分类

### 4.3 Markdown 常用语法速查

文章正文用 Markdown 编写，以下是最常用的语法：

```markdown
# 一级标题
## 二级标题
### 三级标题

**加粗文字**
*斜体文字*
~~删除线~~

- 无序列表项 1
- 无序列表项 2

1. 有序列表项 1
2. 有序列表项 2

> 引用文字

[链接文字](https://example.com)

![图片描述](图片地址)

`行内代码`

​```语言名
代码块
​```
```

> **提示：** 如果你不熟悉 Markdown，推荐使用 **Typora**（https://typora.io/ ）编辑器，所见即所得，非常适合写博客。

### 4.4 创建标签页和分类页

如果你在主题中启用了标签和分类的导航菜单，需要手动创建对应的页面：

**创建标签页：**

```bash
hexo new page tags
```

打开生成的 `source/tags/index.md`，修改为：

```markdown
---
title: 标签
date: 2025-01-01 00:00:00
type: "tags"
layout: "tags"
---
```

**创建分类页：**

```bash
hexo new page categories
```

打开生成的 `source/categories/index.md`，修改为：

```markdown
---
title: 分类
date: 2025-01-01 00:00:00
type: "categories"
layout: "categories"
---
```

**创建关于页：**

```bash
hexo new page about
```

打开 `source/about/index.md`，在 `---` 下方写上你的自我介绍即可。

### 4.5 在文章中插入图片

有以下几种方式：

**方式一：使用网络图片（最简单）**

```markdown
![图片描述](https://example.com/image.jpg)
```

**方式二：使用本地图片**

1. 在博客根目录的 `_config.yml` 中，将 `post_asset_folder` 设为 `true`：

```yaml
post_asset_folder: true
```

2. 之后每次 `hexo new` 创建文章时，会自动在 `source/_posts/` 下生成一个同名文件夹
3. 将图片放入该文件夹，然后在文章中引用：

```markdown
![图片描述](图片文件名.jpg)
```

**方式三：使用图床（推荐）**

将图片上传到图床服务，获取外链后直接在 Markdown 中使用。常见免费图床：

- **SM.MS**：https://smms.app/
- **ImgTP**：https://imgtp.com/

**方式四：使用 VS Code 插件一键粘贴图片（最方便）**

如果你使用 VS Code 写博客，可以安装 **Paste Image** 插件，实现从网页或截图直接粘贴图片：

1. 打开 VS Code，按 `Ctrl + Shift + X` 进入扩展商店
2. 搜索 **Paste Image**（作者：mushan），点击安装
3. 安装后，在网页上复制一张图片（右键 → 复制图片），或者截图后
4. 回到 VS Code 的 Markdown 文件中，按 `Ctrl + Alt + V` 即可自动粘贴

> **说明：** 插件会自动将图片保存到当前文件同级目录下，并在 Markdown 中插入引用路径，无需手动操作。配合 `post_asset_folder: true` 使用效果最佳。

### 4.6 预览文章

写完文章后，执行以下命令即可本地预览：

```bash
hexo clean
hexo g
hexo s
```

打开 http://localhost:4000/ 查看效果，满意后就可以部署上线了！

---

## 五、部署到 GitHub Pages

GitHub Pages 是 GitHub 提供的免费静态网站托管服务，非常适合托管 Hexo 博客。

### 5.1 注册 GitHub 账号

- **GitHub 官网：** https://github.com/
- 如果还没有账号，点击 **Sign up** 注册一个
- 记住你的用户名，后面要用到

### 5.2 创建博客仓库

1. 登录 GitHub，点击右上角 **"+"** → **"New repository"**
2. 仓库名必须填写为：**`你的用户名.github.io`**
   - 例如你的用户名是 `zhangsan`，仓库名就填 `zhangsan.github.io`
   - **名字必须严格按这个格式**，否则 GitHub Pages 不会生效
3. 设置为 **Public**（公开）
4. 其他选项保持默认，点击 **Create repository** 创建

### 5.3 配置 Git 用户信息

在 Git Bash 中执行（替换为你自己的信息）：

```bash
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的GitHub邮箱"
```

### 5.4 配置 SSH Key（免密登录）

每次部署都输密码很麻烦，配置 SSH Key 可以免密操作。

**第一步：生成 SSH Key**

```bash
ssh-keygen -t rsa -C "你的GitHub邮箱"
```

执行后一路按**回车**（Enter）即可，不需要设置密码。

**第二步：复制公钥**

```bash
cat ~/.ssh/id_rsa.pub
```

终端会输出一长串以 `ssh-rsa` 开头的文字，**全部复制**。

**第三步：添加到 GitHub**

1. 打开 GitHub，点击右上角头像 → **Settings**
2. 左侧菜单找到 **SSH and GPG keys**
3. 点击 **New SSH Key**
4. Title 随便填（比如 "我的电脑"），Key 粘贴刚才复制的公钥
5. 点击 **Add SSH Key**

**第四步：验证是否成功**

```bash
ssh -T git@github.com
```

如果显示 `Hi 你的用户名! You've successfully authenticated...`，说明配置成功。

### 5.5 安装部署插件

在博客根目录下执行：

```bash
npm install hexo-deployer-git --save
```

### 5.6 修改部署配置

打开博客根目录下的 `_config.yml`，找到文件**最底部**的 `deploy` 字段，修改为：

```yaml
deploy:
  type: git
  repo: git@github.com:你的用户名/你的用户名.github.io.git
  branch: main
```

> **注意：** 把 `你的用户名` 替换为你的 GitHub 用户名，出现两次都要替换。

### 5.7 一键部署

执行以下命令：

```bash
hexo clean
hexo g
hexo d
```

也可以合并为一条：

```bash
hexo clean && hexo g -d
```

> **说明：**
>
> - `hexo g -d` 等于先生成再部署
> - 首次部署可能需要等待几分钟才能访问

部署成功后，打开浏览器访问：

```
https://你的用户名.github.io
```

恭喜你，你的博客已经上线了！以后每次写完文章，只需要执行 `hexo clean && hexo g -d` 就能更新。

---

## 六、绑定自定义域名

如果你不想用 `xxx.github.io` 这个默认域名，可以绑定一个属于自己的域名，比如 `www.myblog.com`。

### 6.1 购买域名

以下是几个常用的域名注册平台：

| 平台           | 网址                                           | 说明                                    |
| -------------- | ---------------------------------------------- | --------------------------------------- |
| 阿里云（万网） | https://wanwang.aliyun.com/                    | 国内最大，支持 `.cn` 域名               |
| 腾讯云         | https://buy.cloud.tencent.com/domain           | 价格实惠，活动多                        |
| Namesilo       | https://www.namesilo.com/                      | 国外平台，`.com` 域名便宜，免费隐私保护 |
| Cloudflare     | https://www.cloudflare.com/products/registrar/ | 成本价注册，无加价                      |

> **提示：**
>
> - `.com` 域名最通用，首年大约 50-70 元
> - `.cn` 域名需要实名认证
> - 如果只是练手，选便宜的后缀即可（如 `.top`、`.xyz`，首年几块钱）

### 6.2 添加域名解析

在你购买域名的平台上，进入域名管理 → **DNS 解析**，添加以下两条记录：

| 记录类型 | 主机记录 | 记录值               |
| -------- | -------- | -------------------- |
| CNAME    | www      | 你的用户名.github.io |
| CNAME    | @        | 你的用户名.github.io |

> 如果 `@` 不支持 CNAME，可以改用 A 记录，指向 GitHub Pages 的 IP 地址：
>
> ```
> 185.199.108.153
> 185.199.109.153
> 185.199.110.153
> 185.199.111.153
> ```

### 6.3 在博客中配置域名

在博客的 `source/` 目录下新建一个名为 `CNAME` 的文件（**没有后缀名**），内容只写你的域名：

```
www.myblog.com
```

> **重要：** 这个文件必须放在 `source/` 目录下，这样每次 `hexo g` 时会自动复制到生成目录中，否则每次部署后域名绑定会失效。

### 6.4 在 GitHub 仓库中开启自定义域名

1. 打开你的 GitHub 仓库（`用户名.github.io`）
2. 点击 **Settings** → 左侧 **Pages**
3. 在 **Custom domain** 中填入你的域名（如 `www.myblog.com`）
4. 勾选 **Enforce HTTPS**（启用免费 HTTPS）

### 6.5 修改博客配置

打开博客根目录的 `_config.yml`，将 `url` 改为你的域名：

```yaml
url: https://www.myblog.com
```

重新部署：

```bash
hexo clean && hexo g -d
```

等待几分钟后，访问你的域名即可看到博客。

---

## 七、让别人搜到你的博客（SEO 优化）

博客上线后，百度和谷歌不会自动收录你的网站，需要主动提交并做一些 SEO 优化。

### 7.1 安装 SEO 相关插件

在博客根目录下执行：

```bash
npm install hexo-generator-sitemap --save
npm install hexo-generator-baidu-sitemap --save
```

然后在博客根目录的 `_config.yml` 中添加：

```yaml
# 站点地图
sitemap:
  path: sitemap.xml

baidusitemap:
  path: baidusitemap.xml
```

执行 `hexo g` 后会自动在 `public/` 下生成 `sitemap.xml` 和 `baidusitemap.xml`，这是搜索引擎抓取你网站结构的依据。

### 7.2 向 Google 提交收录

1. 打开 **Google Search Console**：https://search.google.com/search-console/
2. 登录 Google 账号，点击 **添加资源**
3. 选择 **网址前缀**，输入你的博客地址（如 `https://你的用户名.github.io`）
4. 按照提示完成验证（推荐 HTML 标签验证方式）
5. 验证成功后，在左侧菜单中找到 **站点地图**
6. 提交你的站点地图 URL：`https://你的博客地址/sitemap.xml`

> Google 收录速度较快，通常几天内就能搜到。

### 7.3 向百度提交收录

1. 打开 **百度搜索资源平台**：https://ziyuan.baidu.com/
2. 注册/登录账号，点击 **用户中心** → **站点管理** → **添加网站**
3. 输入你的博客地址，完成验证
4. 在左侧菜单找到 **链接提交**，选择 **sitemap** 方式
5. 提交你的站点地图 URL：`https://你的博客地址/baidusitemap.xml`

> **注意：** GitHub Pages 默认屏蔽了百度爬虫，可能导致百度收录困难。解决方案：
>
> - 使用 **Vercel**（https://vercel.com/ ）部署一份镜像站点，将百度解析指向 Vercel
> - 或者使用 **Cloudflare**（https://www.cloudflare.com/ ）做 CDN 代理

### 7.4 基础 SEO 优化技巧

**1. 确保每篇文章都有完整的 Front-matter：**

```markdown
---
title: 有意义的标题（包含关键词）
date: 2025-01-01 12:00:00
description: 文章的简要描述，会显示在搜索结果中
tags:
  - 相关标签
categories:
  - 所属分类
---
```

**2. 安装 nofollow 插件（防止权重流失）：**

```bash
npm install hexo-filter-nofollow --save
```

在 `_config.yml` 中添加：

```yaml
nofollow:
  enable: true
  field: site
```

**3. 生成永久链接（避免中文 URL 乱码）：**

安装插件：

```bash
npm install hexo-abbrlink --save
```

在 `_config.yml` 中修改永久链接格式：

```yaml
permalink: posts/:abbrlink.html
abbrlink:
  alg: crc32
  rep: hex
```

这样文章的 URL 会变成类似 `posts/a1b2c3d4.html` 的格式，简洁且对搜索引擎友好。

---

## 八、常用命令速查表

| 命令                      | 简写                | 作用                                 |
| ------------------------- | ------------------- | ------------------------------------ |
| `hexo init [文件夹名]`    | —                   | 初始化一个新的博客项目               |
| `hexo new "文章标题"`     | `hexo n "文章标题"` | 创建一篇新文章                       |
| `hexo new page "页面名"`  | —                   | 创建一个新页面（如 about、tags）     |
| `hexo generate`           | `hexo g`            | 生成静态网页文件                     |
| `hexo server`             | `hexo s`            | 启动本地预览服务器（localhost:4000） |
| `hexo deploy`             | `hexo d`            | 部署到远程仓库（GitHub Pages）       |
| `hexo clean`              | —                   | 清除缓存和已生成的静态文件           |
| `hexo g -d`               | —                   | 生成并部署（二合一）                 |
| `hexo clean && hexo g -d` | —                   | 清除缓存 + 生成 + 部署（最常用）     |

---

## 九、常见问题与解决方案

### Q1：`hexo command not found` / hexo 命令找不到

**原因：** Hexo CLI 没有正确安装，或环境变量没配好。

**解决：**

```bash
npm install -g hexo-cli
```

如果仍然报错，关闭终端重新打开再试。

### Q2：`hexo s` 后浏览器显示空白页

**原因：** 主题没有正确安装或配置。

**解决：**

1. 检查 `_config.yml` 中 `theme` 字段是否和 `themes/` 下的文件夹名一致
2. 确认主题文件夹不是空的（`git clone` 是否成功）
3. 执行 `hexo clean && hexo g && hexo s` 重试

### Q3：部署后网站显示 404

**原因：** 仓库名不对，或部署分支设置错误。

**解决：**

1. 确认仓库名是 `你的用户名.github.io`（必须完全匹配）
2. 检查 `_config.yml` 中 `deploy` 的 `branch` 是否为 `main`
3. 去 GitHub 仓库 → Settings → Pages，确认 Source 选择的是正确分支

### Q4：`hexo d` 部署时报错 `Permission denied (publickey)`

**原因：** SSH Key 没有正确配置。

**解决：**

1. 检查是否已生成 SSH Key：`ls ~/.ssh/`，应该有 `id_rsa` 和 `id_rsa.pub`
2. 确认公钥已添加到 GitHub：Settings → SSH and GPG keys
3. 重新测试连接：`ssh -T git@github.com`

### Q5：每次部署后自定义域名失效

**原因：** `CNAME` 文件没有放在 `source/` 目录下。

**解决：** 确保 `CNAME` 文件在 `source/` 目录中，而不是 `public/` 目录。`hexo clean` 会清空 `public/`，只有放在 `source/` 下才会每次重新生成。

### Q6：npm install 速度非常慢

**原因：** 默认使用的是国外 npm 源。

**解决：** 切换为国内镜像源：

```bash
npm config set registry https://registry.npmmirror.com
```

### Q7：Butterfly 主题报错 `extends includes/mixins/...`

**原因：** 缺少 Butterfly 必需的渲染插件。

**解决：**

```bash
npm install hexo-renderer-pug hexo-renderer-stylus --save
```

### Q8：文章中的图片本地能看到，部署后看不到

**原因：** 图片路径不正确。

**解决：**

1. 确保 `_config.yml` 中 `post_asset_folder: true`
2. 图片放在与文章同名的文件夹中
3. 使用相对路径引用，或直接使用图床外链

---

## 十、推荐插件汇总

| 插件                         | 安装命令                                | 作用                       |
| ---------------------------- | --------------------------------------- | -------------------------- |
| hexo-deployer-git            | `npm i hexo-deployer-git -S`            | 部署到 GitHub Pages        |
| hexo-generator-searchdb      | `npm i hexo-generator-searchdb -S`      | 本地搜索功能               |
| hexo-generator-sitemap       | `npm i hexo-generator-sitemap -S`       | 生成 Google 站点地图       |
| hexo-generator-baidu-sitemap | `npm i hexo-generator-baidu-sitemap -S` | 生成百度站点地图           |
| hexo-filter-nofollow         | `npm i hexo-filter-nofollow -S`         | SEO：外链 nofollow         |
| hexo-abbrlink                | `npm i hexo-abbrlink -S`                | 生成短链接（避免中文 URL） |
| hexo-renderer-pug            | `npm i hexo-renderer-pug -S`            | Butterfly 主题必需         |
| hexo-renderer-stylus         | `npm i hexo-renderer-stylus -S`         | Butterfly 主题必需         |
| hexo-wordcount               | `npm i hexo-wordcount -S`               | 文章字数统计与阅读时长     |

---

## 写在最后

到这里，你已经学会了从零搭建一个 Hexo 博客的完整流程：

1. 安装环境（Node.js + Git + Hexo）
2. 创建并预览博客
3. 配置主题（Next / Butterfly）
4. 用 Markdown 写文章
5. 部署到 GitHub Pages
6. 绑定自定义域名
7. 提交搜索引擎收录 + SEO 优化

**有用的参考链接：**

- Hexo 官方文档：https://hexo.io/zh-cn/docs/
- Butterfly 主题文档：https://butterfly.js.org/
- Next 主题文档：https://theme-next.js.org/
- Markdown 语法教程：https://markdown.com.cn/
- GitHub Pages 文档：https://docs.github.com/cn/pages

祝你搭建顺利，享受写博客的乐趣！
