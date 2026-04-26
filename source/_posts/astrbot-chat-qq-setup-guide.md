---
title: AstrBot 从零到能聊天、能接 QQ 的教程
date: 2026-04-14 20:45:25
updated: 2026-04-14 20:45:25
tags:
  - AstrBot
  - QQ机器人
  - NapCat
  - OneBot
  - Windows
categories:
  - 教程
  - 分享
keywords: AstrBot, QQ机器人, NapCat, OneBot, Windows
description: 从零开始安装 AstrBot、接入大模型，并配置 NapCat 连接 QQ 机器人。
---
# AstrBot 从零到能聊天、能接 QQ 的教程

## 这篇文章要干什么

带你把 AstrBot 装到 Windows 电脑上，接通一个大模型，先在网页上聊起来，然后再把 QQ 机器人接上去。

整个过程按顺序分三步走：

1. 把 AstrBot 本体跑起来
2. 接入大模型，在网页上聊通
3. 装好 NapCat，把 QQ 机器人接上

按这个顺序来，出了问题最容易排查。

---

## 先搞清楚 AstrBot 是什么

AstrBot 不是"一个 QQ 机器人"。它是一个 AI 助手的管理后台，自带网页控制面板，你可以在里面配模型、装插件、接消息平台。

它的结构大概是这样：

- **AstrBot 本体**：主程序，启动之后提供一个网页后台（默认地址 `http://localhost:6185`）。你在后台里配置一切。
- **模型服务**：AstrBot 本身不带模型，你得自己接一个——DeepSeek、OpenAI、通义千问、智谱之类的。没接模型，后台能打开但聊天不工作。
- **消息平台**：QQ、Telegram、企业微信这些是 AstrBot 的"触角"。AstrBot 跑着但 QQ 机器人不在线，完全正常——因为它们是两层东西。

把这三层分清楚，后面遇到问题就知道该查哪里。

---

## 你需要准备的东西

- **Windows 10 或 11 电脑**。Mac 和 Linux 也行，但这篇只讲 Windows。
- **网络**。你会下载 uv、Python、AstrBot 源码和一堆依赖包。
- **一个模型 API Key**。去 DeepSeek、通义千问、智谱等官网注册一个账号，创建 API Key。免费额度通常够你测试。没有这个东西，后面一切白搭。
- **耐心**。第一次配的时候最常见的翻车原因不是代码，是地址填错、Key 填错、忘了点保存、端口写反。

---

## 第一步：装 uv

uv 是一个 Python 环境管理工具，比 pip + venv 更省事。AstrBot 官方推荐用它。

打开 PowerShell（在开始菜单搜"PowerShell"就能找到），输入：

```powershell
winget install --id=astral-sh.uv -e
```

如果你的系统没有 winget 或者这条命令报错，换这个：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

装完之后，**关掉 PowerShell 窗口，重新打开一个新的**。这一步非常重要，不关重开的话系统 PATH 没刷新，会提示找不到 uv。

重新打开后输入 `uv`，如果看到一堆帮助信息（用法说明之类的），就说明装好了。

---

## 第二步：用 uv 装一份 Python

你电脑上可能已经有 Python，但让 uv 单独管理一份更稳妥——不会跟系统里已有的 Python 打架。

AstrBot 支持 Python 3.10 到 3.13。我们装 3.13：

```powershell
uv python install 3.13
```

装完后可以验证一下：

```powershell
uv python list
```

能看到 3.13 的版本号就行。

---

## 第三步：下载 AstrBot 源码

如果你会 git：

```powershell
git clone https://github.com/AstrBotDevs/AstrBot.git
cd AstrBot
```

如果你不会 git：去 https://github.com/AstrBotDevs/AstrBot ，点绿色的 `Code` 按钮，选 `Download ZIP`，下载后解压，然后在 PowerShell 里 `cd` 进解压出来的文件夹。

不管用哪种方式，最终你要在 PowerShell 里站在 AstrBot 项目的根目录——也就是能看到 `main.py`、`README.md` 那个目录。

可以用 `dir` 命令确认一下，看看当前目录下有没有 `main.py`。

---

## 第四步：安装依赖并启动

在 AstrBot 根目录下，依次执行：

```powershell
uv sync
uv run main.py
```

`uv sync` 会把 AstrBot 需要的所有 Python 包装好，同时自动创建一个虚拟环境（你不需要手动管）。

`uv run main.py` 会在这个虚拟环境里启动 AstrBot。不要用 `python main.py`，因为直接调 python 很可能用到的不是 uv 管理的那个环境，会出现"包明明装了却找不到"的问题。

**以后日常启动**，如果你没改过依赖、没装新插件，可以用加速版：

```powershell
uv run --no-sync main.py
```

跳过依赖同步，启动更快。

---

## 第五步：确认 AstrBot 启动成功

终端会输出一大堆日志，不用全看。找两个信号：

1. 出现类似 `Dashboard started` 或 `WebUI started` 的字样
2. 出现地址 `http://localhost:6185`

看到了就说明后台已经起来了。

打开浏览器，访问 `http://localhost:6185`。

默认账号密码都是 `astrbot`。登录后建议马上改密码，尤其是你将来打算开放给局域网或部署到服务器的话。

---

## 第六步：接入大模型

登录后台，看左边菜单，找到 **"服务提供商"**（或类似名字的页面，具体措辞可能随版本变化）。

操作流程：

1. 点"新增提供商"
2. 选择类型（大多数国内模型服务商选 **OpenAI 兼容** 即可，因为 DeepSeek、通义千问、智谱等都支持 OpenAI 兼容接口）
3. 填入 **API Key**
4. 填入 **API Base URL**
5. 点"获取模型列表"
6. 从列表里选择你要用的模型
7. 把这个模型设为默认聊天模型
8. 保存

### 以 DeepSeek 为例，具体怎么拿到 Key 和 URL

1. 去 https://platform.deepseek.com/ 注册账号
2. 登录后进入 API Keys 页面，点"创建 API Key"，复制保存好（只显示一次）
3. Base URL 填：`https://api.deepseek.com/v1`
4. 回到 AstrBot 后台，把 Key 和 URL 粘进去
5. 点获取模型列表，选 `deepseek-chat`（这是 DeepSeek-V3），保存

### 关于 Base URL 末尾的 `/v1`

这个地方每次都有人栽。规则很简单：

**如果模型服务商的文档里给的地址末尾没有 `/v1`，你自己加上 `/v1`。** 比如 DeepSeek 文档里写的是 `https://api.deepseek.com`，你在 AstrBot 里要填 `https://api.deepseek.com/v1`。

少了这一截，你会发现模型列表拉不出来、聊天一直报错，报错信息还可能误导你以为是 Key 不对。

### 其他常见服务商的 Base URL 参考

| 服务商              | Base URL                                            |
| ------------------- | --------------------------------------------------- |
| DeepSeek            | `https://api.deepseek.com/v1`                       |
| 通义千问 (Qwen)     | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱 (GLM)          | `https://open.bigmodel.cn/api/paas/v4`              |
| OpenAI              | `https://api.openai.com/v1`                         |
| Moonshot (月之暗面) | `https://api.moonshot.cn/v1`                        |

具体以各服务商最新文档为准，但格式基本就是这样。

### 不建议用第三方转发接口

特别是那种"便宜量大"的中转 API。稳定性差、有数据泄露风险，而且可能有合规问题。第一次上手，直接用官方的。

---

## 第七步：在网页里测试聊天

模型接好之后，在后台里找到聊天入口（有的版本在首页就有，有的在单独的页面），发一条消息试试。

**一定要先在网页里聊通，再去搞 QQ。**

原因：如果网页里都聊不通，那问题在模型配置（Key、URL、默认模型没选之类的）。如果网页聊得动但 QQ 没反应，那问题在 QQ 接入层。这样你能一下子把排查范围砍掉一半。

### 如果网页聊天没反应或报错，检查这几项

- API Key 是不是复制的时候多了空格或少了字符
- Base URL 有没有漏 `/v1`
- 有没有选默认模型
- 配置有没有点保存

---

## 第八步：接 QQ 机器人——先理解架构

网页聊天的链路是：

```
你的浏览器 ↔ AstrBot ↔ 大模型
```

QQ 机器人的链路是：

```
QQ 用户 ↔ QQ 服务器 ↔ NapCat ↔ AstrBot ↔ 大模型
```

中间多了一层 NapCat。NapCat 的作用是：用一个 QQ 号登录上去，接收 QQ 消息，然后按 OneBot v11 协议转发给 AstrBot。AstrBot 处理完之后再通过 NapCat 把回复发回 QQ。

所以接 QQ 需要做两件事：
1. 在 AstrBot 后台配置一个 OneBot v11 的接收端
2. 装好 NapCat 并让它连到 AstrBot

---

## 第九步：AstrBot 这边的配置

在后台找到 **"机器人"** 页面：

1. 点"创建机器人"
2. 类型选 **OneBot v11**
3. 填写配置：
   - **ID**：随便起个名字，比如 `my-qq-bot`，只是用来区分的
   - **启用**：开
   - **反向 WebSocket 主机地址**：填 `0.0.0.0`（意思是监听所有网络接口，本机和局域网都能连）
   - **反向 WebSocket 端口**：填 `6199`（默认值，你也可以改成别的，但两边要一致）
   - **反向 WebSocket Token**：如果你不想设密码验证，留空就行；如果填了，NapCat 那边也要填一样的
4. 保存

保存后，AstrBot 就会在 `6199` 端口上等待 NapCat 来连接。

---

## 第十步：安装和配置 NapCat

NapCat 的安装方式以它自己的官方文档为准：https://napcat.napneko.icu/

这里讲 Windows 上最常见的方式。

### 安装

NapCat 提供了 Windows 安装包。去它的 GitHub Releases 页面（ https://github.com/NapNeko/NapCatQQ/releases ）下载最新的 Windows 版本，解压即可。

具体安装方式可能随版本变化，按它自带的说明文档操作。关键是安装完之后你要能启动它并登录一个 QQ 号。

### 登录 QQ

启动 NapCat 后，它会让你用一个 QQ 号登录。这个号就是将来的"机器人号"。

**注意**：不要同时用普通 QQ 客户端登录这个号。NapCat 和普通客户端会互相踢，导致反复掉线。建议用一个专门的小号当机器人。

### 配置 WebSocket 连接

登录成功后，进入 NapCat 的网页设置（NapCat 通常也有一个自己的 Web 管理界面），找到"网络配置"或"WebSocket 客户端"之类的设置项，新增一个连接：

- **启用**：开
- **URL**：`ws://127.0.0.1:6199/ws`
  - 这里的 `127.0.0.1` 是因为 NapCat 和 AstrBot 跑在同一台电脑上。如果不在同一台机器，换成 AstrBot 所在机器的 IP。
  - `6199` 要跟你在 AstrBot 里填的端口一致。
  - 末尾的 `/ws` 不能省。
- **消息格式**：选 `Array`
- **Token**：如果你在 AstrBot 那边填了 Token，这里填一样的；如果 AstrBot 那边留空了，这里也留空
- 心跳间隔和重连间隔可以保持默认，也可以改成 `1000`（毫秒）

保存配置。

### 整个连接只取决于三件事

1. URL 里的 IP 地址对不对
2. 端口号两边一不一致
3. Token 两边一不一致

其他选项都是锦上添花的。

---

## 第十一步：确认 QQ 机器人接通了

回到 AstrBot 的后台，进入 **"控制台"** 页面，看日志。

如果你看到类似这样的字样：

```
aiocqhttp(OneBot v11) 适配器已连接
```

就说明 NapCat 已经成功连到 AstrBot 了。

这时候去 QQ 里，用另一个号给机器人号发消息、或者在群里 @ 它，它应该就会回复了。

### 如果没连上

- 检查 NapCat 是不是确实登录了 QQ（看 NapCat 自己的界面）
- 检查 NapCat 配置里的 WebSocket URL 是不是写对了（IP、端口、`/ws` 后缀）
- 检查 AstrBot 是不是确实在运行（终端窗口是不是还开着）
- 检查是不是有防火墙拦截了 6199 端口

### 如果连上了但群里不回复

- 检查群里是不是需要 @ 机器人才触发（有些配置下默认需要 @）
- 检查 AstrBot 后台有没有配置"唤醒规则"
- 检查这个 QQ 号在群里是不是被禁言了
- 看看 AstrBot 控制台日志里有没有收到消息的记录——如果收到了但没回复，可能是模型那边的问题；如果根本没收到，那是 NapCat 那层的问题

---

## 每天用的时候，启动顺序

### 只用网页聊天

1. 启动 AstrBot（`uv run main.py`）
2. 浏览器打开 `http://localhost:6185`
3. 直接聊

### 要让 QQ 机器人工作

1. 先启动 AstrBot
2. 确认后台能打开
3. 再启动 NapCat，登录 QQ
4. 去 AstrBot 控制台确认 OneBot 已连接
5. 去 QQ 里测试

**一定先开 AstrBot，再开 NapCat。** 反过来的话 NapCat 会一直尝试连一个还不存在的地址，日志里一堆重连报错，看着很吓人但其实只是顺序反了。

---

## 关于插件

AstrBot 有插件系统，能扩展功能，但第一次用的时候别着急装。

先确保三件事搞定了：

1. AstrBot 能正常启动
2. 模型接通了，网页能聊天
3. （如果你需要的话）QQ 机器人接上了

然后再一次装一个插件，装完就测试，确认没问题再装下一个。同时装一堆插件出了问题，你根本分不清是哪个插件的锅。

---

## 如果打算长期挂着

这篇教的是源码部署方式，适合第一次上手、搞清楚 AstrBot 怎么回事。

如果后面你打算：
- 放到服务器上 24 小时跑
- 稳定给别人用
- 方便升级和迁移

建议转到 Docker 部署。Docker 在重启恢复、数据持久化、环境隔离上都更省心。AstrBot 官方有 Docker 部署文档，搞通了源码版之后再看 Docker 版会容易很多。

---

## 卡住了怎么求助

不管是问群友、发帖还是问 AI，最有效的方式是把这几样东西一起贴出来：

- 你卡在哪一步
- 你执行了什么命令
- 终端里完整的报错信息（不是截一小段，是从报错开始到结束的完整内容）
- AstrBot 后台的截图
- 如果有日志文件，也贴上

只说"它报错了"或者"不工作"，谁也帮不了你。把上面这些信息贴齐，不管是问 ChatGPT、Claude 还是社区里的人，效率都会高很多。

---

## 官方文档汇总

| 内容                     | 地址                                                    |
| ------------------------ | ------------------------------------------------------- |
| AstrBot 官方首页         | https://docs.astrbot.app/                               |
| 源码部署                 | https://docs.astrbot.app/deploy/astrbot/cli.html        |
| 管理面板                 | https://docs.astrbot.app/use/webui.html                 |
| 接入模型服务             | https://docs.astrbot.app/config/providers/start.html    |
| 接入消息平台             | https://docs.astrbot.app/platform/start.html            |
| 接入 OneBot v11 / NapCat | https://docs.astrbot.app/platform/aiocqhttp.html        |
| uv 安装                  | https://docs.astral.sh/uv/getting-started/installation/ |
| uv 安装 Python           | https://docs.astral.sh/uv/guides/install-python/        |

---

## 总结

整个过程核心就三步：

1. **装好 AstrBot，打开后台** → 说明本体没问题
2. **接入模型，网页里能聊天** → 说明模型配置没问题
3. **装好 NapCat，QQ 机器人上线** → 说明接入层没问题

按这个顺序来，每一步都能独立验证，出问题知道查哪里。不要试图一口气全部搞定——先把网页聊天跑通，QQ 机器人只是在那之上多接一层的事。
