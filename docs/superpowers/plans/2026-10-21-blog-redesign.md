# 博客改版实施计划：冷色单栏与五个主题

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计文档把 Butterfly 默认站改成"像一个人"的冷色单栏博客：新首页、新文章页、正文正确分段、五个可切换主题（各有白天和夜晚）。

**Architecture:**
- 不改 `themes/butterfly` 子模块。站点自己的 pug 模板放在新目录 `theme-overrides/`（目录结构与主题的 `layout/` 一一对应），由 `scripts/theme-overrides.js` 在 `before_generate` 阶段调用 `hexo.theme.setView()` 替换同名视图。
- 主题数据只有一个来源：`source/_data/polaris-themes.json`。生成网站时由它产出两样东西：配色 CSS，以及内联在 `<head>` 里的早期加载脚本（用来避免刷新时先闪一下默认配色）。
- 纯逻辑一律写成可测的函数（分段、引文排版、目录行、星空、主题解析），用 `node:test` 测试。整站结构用 `tools/site-build.check.mjs` 在生成的 `public/` 上检查。

**Tech Stack:** Hexo 8.1、Butterfly 5.5.4（pug）、hexo-renderer-marked、Node 24（本机）/ 22（CI）、`node:test`；后台 Next.js + vitest + react-markdown；字体 `@fontsource/noto-serif-sc@5.3.1`、`@fontsource/long-cang@5.3.0`、`@fontsource/ma-shan-zheng@5.3.1`。

**Spec:** `docs/superpowers/specs/2026-10-21-blog-redesign-design.md`

## Global Constraints

- 不修改 `themes/butterfly/` 下任何文件。需要 fork 主题时，停下来问用户。
- 不修改 `source/_posts/` 下的文章源文件。分段只在渲染阶段处理。
- 不动 `.git/config` 和 worktree 指针，不用 git worktree。在分支 `redesign/cold-themes` 上工作；不推送、不开 PR，等用户看过再说。
- 资源本地托管：不引用 Google Fonts 或其他外部 CDN 的字体和 CSS。
- 信息之间用全角空格或中文逗号分隔，不用"·"；不用加大字距的小标题；不用卡片阴影。
- 文字对比度达到 WCAG AA：正文、次要文字、链接对底色至少 4.5:1。
- `prefers-reduced-motion: reduce` 时，星空和所有过渡完全静止。
- 手机宽度（375px）下没有横向滚动。
- 主题 id 固定为：`fog`（雾，默认）、`frost`（霜）、`celadon`（青瓷）、`zine`（小志）、`manuscript`（稿纸）。localStorage 新键名是 `polaris-theme`，旧键名 `polaris-palette` 只读不写。
- 引文库就是 `_config.butterfly.yml` 里的 `subtitle.sub`，不另外复制一份。

## Review Focus

1. **老读者的浏览器里存着旧配色值**（mint、rose 等），或者 localStorage 被禁用：网站照常显示，旧值按映射转成新主题，没有报错。这条由 Task 3 的 `boot script` 测试覆盖。
2. **代码块、列表、表格、HTML、公式、Hexo 标签块紧挨着正文行**：分段处理不能动它们。这条由 Task 2 的测试用例覆盖。
3. **引文很长、全是英文、或者标点正好落在行首**：竖排时断列正确；稿纸里遵守避头点，英文逐字母占格。这条由 Task 5 的 `polaris-quote` 测试覆盖。
4. **超长标题出现在 375px 手机上**：比如"大一下总结（……十四门课……）"。目录行要能折行，不能撑出横向滚动。这条由 Task 9 的手机截图检查覆盖，Task 5 的 CSS 要写 `min-width: 0` 和 `overflow-wrap: anywhere`。
5. **读者没开 JavaScript**：首页仍能看到一句引文（生成网站时就渲染好的第一句）和完整的目录。这条由 Task 5 的 site check 覆盖。

---

### Task 1: 分支、依赖和视图覆盖机制

**Files:**
- Create: `scripts/theme-overrides.js`
- Create: `theme-overrides/includes/header/index.pug`（第一版先放一个可检测的标记，Task 4 再写正式内容）
- Create: `tools/site-build.check.mjs`
- Modify: `package.json`（scripts）
- Modify: `.github/workflows/deploy.yml`（测试那一行）

**Interfaces:**
- Produces:
  - `theme-overrides/<路径>.pug` 会覆盖主题的 `layout/<路径>.pug`。pug 里的相对 include 仍按主题的 `layout/` 目录解析。
  - `npm test` 运行 `node --test "tools/*.test.mjs"`。
  - `npm run test:site` 运行 `hexo clean && hexo generate && node --test tools/site-build.check.mjs`。
  - `tools/site-build.check.mjs` 导出读取 `public/` 的工具函数 `readPage(relPath: string): string`，后续任务往这个文件里追加 test。

- [ ] **Step 1:** 下载依赖前先征得用户同意（需要说明来源和大小）。同意后执行 `git switch -c redesign/cold-themes`、根目录 `npm ci`、`admin/` 下 `npm ci`。
- [ ] **Step 2:** 跑基线：`npm run build` 应该成功；`node --test tools/guestbook.test.mjs` 应该全部 PASS。
- [ ] **Step 3: 写一个会失败的 site check**

```js
test('theme override views are applied', () => {
  assert.match(readPage('index.html'), /data-polaris-override="header"/)
})
```

- [ ] **Step 4:** 运行 `npm run test:site`，预期 FAIL。
- [ ] **Step 5:** 实现 `scripts/theme-overrides.js`：
  - 递归读取 `theme-overrides/` 下的 `.pug` 文件；
  - 在 `hexo.extend.filter.register('before_generate', …)` 里对每个文件调用 `hexo.theme.setView(相对路径, 内容)`；
  - 相对路径统一用 `/` 分隔。
- [ ] **Step 6:** 写 `theme-overrides/includes/header/index.pug`：先照抄主题原文件，再在 `header#page-header` 上加属性 `data-polaris-override="header"`。运行 `npm run test:site`，预期 PASS。
- [ ] **Step 7:** 把 `deploy.yml` 里的 `node --test tools/guestbook.test.mjs` 改成 `npm test`。
- [ ] **Step 8:** 提交：`git commit -m "build: add theme view overrides and site checks"`

### Task 2: 正文分段（网站和后台预览）

**Files:**
- Create: `scripts/lib/prose-paragraphs.js`
- Create: `scripts/prose-paragraphs.js`
- Create: `tools/fixtures/prose-paragraphs.cases.json`
- Create: `tools/prose-paragraphs.test.mjs`
- Create: `admin/src/lib/prose-paragraphs.ts`
- Create: `admin/src/lib/prose-paragraphs.test.ts`
- Modify: `admin/src/components/editor/markdown-preview.tsx`（传给 `ReactMarkdown` 之前先处理）
- Modify: `tools/site-build.check.mjs`

**Interfaces:**
- Produces:
  - `splitProseLines(markdown: string): string`：如果相邻两行都是"正文行"，就在它们之间插入一个空行。
    - "正文行"指非空、不以空白开头、不在代码块/公式块/HTML 块/Hexo 标签块之内的行。
    - 以下开头的行不算正文行：`#`+空格、`-`/`*`/`+`+空格、`数字.`/`数字)`+空格、`>`、`|`、`<`、`{%`、`[^`、`[xxx]:`。
    - 由 `---`、`===`、`***` 组成的整行也不算。
    - 以两个空格或 `\` 结尾的行，后面不插空行。
    - 保留原文的换行风格（`\n` 或 `\r\n`）。
  - 网站端只处理 `data.source` 以 `_posts/` 开头的文件，挂在 `before_post_render`。

- [ ] **Step 1: 写测试用例 fixture**

  `tools/fixtures/prose-paragraphs.cases.json` 是一个 `[{name, input, expected}]` 数组，至少包括：

  | name | input | expected |
  |---|---|---|
  | split-prose | `"第一行\n第二行"` | `"第一行\n\n第二行"` |
  | keep-blank | `"A\n\nB"` | 不变 |
  | crlf | `"一\r\n二"` | `"一\r\n\r\n二"` |
  | fence | ``"说明\n```js\na\nb\n```\n后文"`` | 不变 |
  | list | `"段落\n- a\n- b"` | 不变 |
  | list-continuation | `"- item\n  续行"` | 不变 |
  | table | `"\| a \| b \|\n\|---\|---\|\n\| 1 \| 2 \|"` | 不变 |
  | quote | `"> a\n> b"` | 不变 |
  | html | `"<div>\n文字\n文字\n</div>"` | 不变 |
  | math | `"$$\na\nb\n$$"` | 不变 |
  | hexo-tag-block | `"{% note info %}\n一\n二\n{% endnote %}"` | 不变 |
  | heading | `"# 标题\n正文"` | 不变 |
  | setext | `"文字\n---"` | 不变 |
  | hard-break | `"一  \n二"` | 不变 |
  | three-lines | `"一\n二\n三"` | `"一\n\n二\n\n三"` |

- [ ] **Step 2:** `tools/prose-paragraphs.test.mjs` 逐条断言 `splitProseLines(input) === expected`。`admin/src/lib/prose-paragraphs.test.ts` 读取同一个 fixture（路径 `../../../tools/fixtures/prose-paragraphs.cases.json`），做同样的断言。admin CI 是完整检出整个仓库的，所以这个相对路径可用。
- [ ] **Step 3:** 运行 `npm test` 和 `cd admin && npm test`，预期 FAIL（模块不存在）。
- [ ] **Step 4:** 实现两个 `splitProseLines`：网站端用 CommonJS，后台用 TS，两边逻辑相同。
  - 网站和后台分开部署，后台不能 import 仓库根目录的代码，所以只能写两份；靠共用的 fixture 保证行为一致。
  - 状态机要跟踪：围栏代码（```` ``` ```` / `~~~`）、`$$`、HTML 块（直到空行结束）、`{% x %}…{% endx %}`。
- [ ] **Step 5:** 两边测试都 PASS。
- [ ] **Step 6:** 在 site check 里加一条 test：`posts/why-i-blog/index.html` 的 `#article-container` 里至少有 5 个 `<p>`。运行 `npm run test:site`，预期 PASS。
- [ ] **Step 7:** 运行 `cd admin && npm run lint && npm run typecheck`，预期通过。
- [ ] **Step 8:** 提交：`feat: split single-newline prose into paragraphs on site and admin preview`

### Task 3: 主题数据、早期加载脚本、配色变量与字体

**Files:**
- Create: `source/_data/polaris-themes.json`
- Create: `scripts/lib/polaris-themes.js`
- Create: `scripts/polaris-themes.js`（注册 injector 和生成器）
- Create: `scripts/polaris-fonts.js`
- Create: `tools/polaris-themes.test.mjs`
- Modify: `package.json`（`dependencies` 加三个 `@fontsource` 包，版本见 Tech Stack）
- Modify: `tools/site-build.check.mjs`

**Interfaces:**
- Produces:
  - `polaris-themes.json` 的结构：

    ```json
    {
      "default": "fog",
      "storageKey": "polaris-theme",
      "legacyKey": "polaris-palette",
      "legacyMap": {},
      "themes": [
        { "id": "", "name": "", "light": {}, "dark": {}, "fonts": {} }
      ]
    }
    ```

    - `legacyMap` 是 `mint→celadon`，`rose`、`blue`、`lavender`、`amber` 都 `→fog`。
    - `light`/`dark` 的键：`bg ink muted accent line`，`dark` 另有 `star`。
    - 小志另有 `spot`；稿纸另有 `grid gridSoft`。
    - `fonts` 的键：`body`，以及可选的 `hand`。
  - `resolveTheme(stored: string|null, legacy: string|null, config): string`：
    - `stored` 是合法 id 时返回它；
    - 否则按 `legacyMap[legacy]` 返回；
    - 再否则返回 `config.default`。
  - `buildTokenCss(config): string`：为每个主题和每种模式各输出一段，选择器是 `html[data-polaris-theme="<id>"][data-theme="<light|dark>"]`。每个键输出成 `--p-<kebab-case 键名>`，例如 `gridSoft` → `--p-grid-soft`，`fonts.body` → `--p-font-body`。
  - `buildBootScript(config): string`：一段自执行脚本，做三件事：
    - 用 `try/catch` 读两个 localStorage 键；
    - 调用内联进去的 `resolveTheme`（用 `resolveTheme.toString()` 拼进去，保持只有一份实现）；
    - 设置 `document.documentElement.dataset.polarisTheme`，并定义 `window.POLARIS_THEMES = config.themes`。
  - 页面产物：
    - `/css/polaris-tokens.css`，由生成器产出；
    - `head_begin` 位置的内联 `<script>`，用 `hexo.extend.injector` 注入，必须排在 Butterfly 自己的深色模式脚本之前或附近；
    - `/fonts/<包名>/<weight>.css` 及其引用的全部 `.woff2` 文件，由生成器从 `node_modules/@fontsource/*` 复制。

- [ ] **Step 1:** 下载新依赖前征得用户同意。三个包未解压大小：noto-serif-sc 约 87MB，long-cang 约 12MB，ma-shan-zheng 约 14MB。同意后执行 `npm install @fontsource/noto-serif-sc@5.3.1 @fontsource/long-cang@5.3.0 @fontsource/ma-shan-zheng@5.3.1`。
- [ ] **Step 2:** 写 `polaris-themes.json`。冷色三套的色值照抄 spec 第四节第 4 小节的表格；小志、稿纸白天的色值照抄 spec。两个夜晚按 spec 第五节给的方向自定：
  - 小志夜：深靛蓝底、米白字、黄星；
  - 稿纸夜：深墨绿底、浅绿格线、米白字。
- [ ] **Step 3: 写会失败的测试**（`tools/polaris-themes.test.mjs`）

```js
test('resolveTheme prefers a valid stored id', () => assert.equal(resolveTheme('frost', 'mint', config), 'frost'))
test('resolveTheme maps legacy palettes', () => {
  assert.equal(resolveTheme(null, 'mint', config), 'celadon')
  assert.equal(resolveTheme(null, 'amber', config), 'fog')
})
test('resolveTheme falls back to fog', () => assert.equal(resolveTheme('garbage', null, config), 'fog'))
test('boot script survives blocked storage', () => {
  // 用 node:vm 运行 buildBootScript(config)
  // 沙箱里的 localStorage.getItem 会抛异常
  // 断言 dataset.polarisTheme === 'fog'，并且 POLARIS_THEMES.length === 5
})
test('token css covers every theme and mode', () => {
  const css = buildTokenCss(config)
  for (const t of config.themes) for (const m of ['light', 'dark'])
    assert.ok(css.includes(`html[data-polaris-theme="${t.id}"][data-theme="${m}"]`))
  assert.match(css, /--p-bg:\s*#eef1f2/)
})
test('text colors meet WCAG AA on their background', () => {
  // 对每个主题、每种模式，ink、muted、accent 对 bg 的对比度都要 >= 4.5
  // contrastRatio 用 WCAG 相对亮度公式，在测试文件里实现
})
```

- [ ] **Step 4:** 运行 `npm test`，预期 FAIL。
- [ ] **Step 5:** 实现 `scripts/lib/polaris-themes.js` 和 `scripts/polaris-themes.js`。
- [ ] **Step 6:** 对比度测试会让 spec 里几个次要文字色不合格。例如雾的 `#7f8a92` 在 `#eef1f2` 上大约只有 3.1:1。处理办法是保持色相、只调明度，直到测试通过。把改过的色值记下来，最后汇报给用户。
- [ ] **Step 7:** 实现 `scripts/polaris-fonts.js`：用 `hexo.extend.generator` 输出两类文件：
  - 思源宋体的 400 和 500，以及 Long Cang、Ma Shan Zheng 的 400；
  - 每个 css 引用的所有 woff2，返回 `fs.createReadStream` 作为 data。
- [ ] **Step 8:** 在 site check 里加两条 test：
  - `index.html` 的 `<head>` 里有 `dataset.polarisTheme` 的内联脚本，有 `/css/polaris-tokens.css` 的 link，有三个字体 css 的 link；
  - `public/fonts/noto-serif-sc/400.css` 里每个 `url(...)` 指向的文件都存在于 `public/` 中。
- [ ] **Step 9:** 运行 `npm test` 和 `npm run test:site`，预期 PASS。
- [ ] **Step 10:** 提交：`feat: add theme data, boot script, token css and self-hosted fonts`

### Task 4: 外壳——配置、导航、页脚、右下角按钮、换主题面板

**Files:**
- Modify: `_config.butterfly.yml`
- Modify: `_config.yml`（`index_generator.per_page: 30`）
- Modify: `theme-overrides/includes/header/index.pug`（正式内容）
- Create: `theme-overrides/includes/header/nav.pug`
- Create: `theme-overrides/includes/footer.pug`
- Create: `theme-overrides/includes/rightside.pug`
- Create: `source/js/polaris-theme-picker.js`
- Create: `source/js/polaris-shell.js`（填运行天数）
- Create: `source/css/polaris-base.css`
- Modify: `source/js/site-accessibility.js`（删掉配色面板相关代码）
- Modify: `scripts/site-accessibility.js`（删掉对 `#search-button` 和 `#toggle-menu` 的两段正则替换，因为新导航直接输出 button）
- Modify: `tools/site-build.check.mjs`

**Interfaces:**
- Consumes: Task 3 的 `window.POLARIS_THEMES`、`html[data-polaris-theme]`、`--p-*` 变量。
- Produces:
  - DOM 钩子：
    - `nav#nav`：首页以外的页面有 `a.polaris-home-link`；所有页面有 `#search-button > button.search`。
    - `footer#footer .polaris-footer`。
    - `#rightside` 里依次是：`#mobile-toc-button`（有目录时）、`#polaris-font-size`（仅文章页）、`#readmode`（仅文章页）、`#darkmode`、`#polaris-theme-toggle`、`#go-up`。不再有齿轮按钮。
  - 页脚运行天数：`span#polaris-runtime[data-since="2026-02-01"]`，由 `polaris-shell.js` 计算并填入"N 天"。Butterfly 的 `addRuntime` 在文章页不会执行，所以不复用它。

- [ ] **Step 1:** 在 site check 里先写会失败的 test：
  - `index.html` 里没有 `.menus_items`、没有 `#aside-content`、没有 `fa-rss`、没有 `#rightside-config`；
  - 页脚里有 `/archives/`、`/guestbook/`、`/about/` 三个链接，有 `busuanzi_value_site_uv`、`busuanzi_value_site_pv`、`polaris-runtime`，有"篇文章"；
  - `posts/why-i-blog/index.html` 里有 `#polaris-font-size` 和 `#polaris-theme-toggle`；
  - `index.html` 里没有 `.polaris-home-link`。
- [ ] **Step 2:** 运行 `npm run test:site`，预期 FAIL。
- [ ] **Step 3:** 改 `_config.butterfly.yml`：
  - `menu` 清空；`aside.enable: false`；`disable_top_img: true`；
  - `subtitle.effect: false`；`reward.enable: false`；`related_post.enable: false`；`post_copyright.enable: false`；
  - `code_blocks.macStyle: false`；
  - `social` 删掉 RSS 那行；`share.sharejs.sites: wechat,weibo,qq,facebook,x`；
  - `inject.head` 去掉 `site-polish.css`，加上 `polaris-base.css` 和三个字体 css；
  - `inject.bottom` 加上 `polaris-shell.js` 和 `polaris-theme-picker.js`。
- [ ] **Step 4:** 写四个 pug 覆盖文件：
  - `header/index.pug`：只输出 `nav.pug`；首页和文章页不输出 `h1.title-seo`，因为它们自己有 h1。
  - `nav.pug`：按上面的 DOM 钩子输出。
  - `footer.pug`：两行。
    - 第一行左边是三个链接，用全角空格隔开；右边是 `${site.posts.length} 篇文章，` + UV + ` 位访客，` + PV + ` 次浏览`。
    - 第二行左边是 `© ${footer.owner.since}–${当年} Lil Polaris`；右边是 `已运行 ` + `#polaris-runtime` + `，${最新一篇文章的日期，格式 M 月 D 日}更新`。
  - `rightside.pug`：按上面的顺序输出。按钮都带 `aria-label`；`#polaris-theme-toggle` 和 `#polaris-font-size` 带 `aria-haspopup`、`aria-expanded`、`aria-controls`。
- [ ] **Step 5:** 写 `polaris-theme-picker.js`。从旧的 `site-accessibility.js` 配色面板代码移植交互：打开/关闭、Esc 关闭并把焦点还给按钮、点外面关闭、选中项 `aria-pressed`。
  - 面板列出五个主题；每项显示名称，加上白天和夜晚两个 `bg` 色块。
  - 选中后设置 `dataset.polarisTheme`，并写入 `polaris-theme`。
- [ ] **Step 6:** 写 `polaris-base.css`，包括：
  - 全局字体（`var(--p-font-body)`）和底色；
  - 把 Butterfly 的变量映射到 `--p-*`：`--global-bg`、`--font-color`、`--card-bg`、`--btn-bg`、`--hr-border`、`--search-bg`、代码块相关变量等；
  - 导航、页脚、右下角按钮常驻（覆盖 Butterfly 滚动后才出现的行为）、两个弹出面板；
  - 焦点样式和搜索框样式，从 `site-polish.css` 迁移过来，改用新变量。
- [ ] **Step 7:** 运行 `npm run test:site` 和 `npm test`，预期 PASS。
- [ ] **Step 8:** 提交：`feat: replace butterfly shell with quiet nav, footer and theme picker`

### Task 5: 首页

**Files:**
- Create: `scripts/lib/polaris-home.js`
- Create: `scripts/polaris-helpers.js`（注册 helper）
- Create: `source/js/polaris-quote-core.js`（UMD 格式，Node 和浏览器共用）
- Create: `source/js/polaris-home.js`
- Create: `theme-overrides/index.pug`
- Create: `source/css/polaris-home.css`
- Create: `tools/polaris-home.test.mjs`
- Create: `tools/polaris-quote.test.mjs`
- Modify: `_config.butterfly.yml`（`inject` 加上 home 的 css 和 js）
- Modify: `tools/site-build.check.mjs`

**Interfaces:**
- Consumes: Task 4 的外壳。
- Produces:
  - `tocRows(posts, { markNewest: boolean }): Row[]`
    - `Row` 有两种：
      - `{ type: 'year', year: number }`；
      - `{ type: 'post', title, path, date: 'MM.DD', category: { name, path } | null, sticky: boolean, newest: boolean }`。
    - 输入的 `posts` 是普通对象数组：`{ title, path, date: Date, sticky?: number, categories: [{ name, path, parent?: string }] }`。
    - 分类取顶层那个（没有 `parent` 的）。
    - 置顶文章排在最前，前面不加年份行。
    - 非置顶文章出现跨年时，在前面插入年份行。
    - `markNewest` 为真时，第一个非置顶文章的 `newest` 为 `true`。
  - `starField({ count, seed, width, height }): { stars: {x,y,r,opacity}[], polaris: {x,y} }`
    - 同一个 seed 输出相同，用 mulberry32；
    - `r` 在 0.5–1.1 之间，`opacity` 在 0.25–0.6 之间；
    - 北极星固定在 `(0.79·width, 0.25·height)`。
  - `splitQuoteColumns(quote: string): string[] | null`
    - 不含汉字时返回 `null`，表示横排；
    - 在 `，、；：,` 和中间位置的 `。` 处断开，并去掉断开处的标点；
    - 句末的 `？！` 保留，句末的 `。` 去掉。
  - `layoutManuscript({ title, quote, columns }): string[][]`
    - 每行固定 `columns` 格，空格子是 `''`；
    - 标题每个字符一格，写完补满整行，然后接一整行空行；
    - 引文段首空两格，每个字符一格；
    - 避头点：行首会出现 `，。、；：？！”’）》」』…` 时，把这个标点并入上一行最后一格。
  - Helper：
    - `polaris_toc_rows(posts)`：把 Hexo 的 Query 转成数组，再调 `tocRows`；
    - `polaris_stars()`：固定参数 `{count: 20, seed: 'polaris', width: 680, height: 300}`；
    - `polaris_quote_columns(text)`：用于在生成网站时就渲染好默认引文。
  - DOM：
    - `section.polaris-hero`：里面有 `svg.polaris-hero__sky`、`svg.polaris-hero__zine-star`、`h1.polaris-hero__title > span + span`、`.polaris-hero__social`、`.polaris-hero__quote`、`.polaris-hero__manuscript`；
    - `script#polaris-quotes[type=application/json]`：完整的引文数组，`<` 转义成 `<`；
    - `ol.polaris-toc > li.polaris-toc__row`，年份行是 `li.polaris-toc__year`；
    - `.polaris-toc__label`：内容"最近写的"，只在小志主题下显示。

- [ ] **Step 1:** 写会失败的单元测试。

```js
// polaris-quote.test.mjs
assert.deepEqual(splitQuoteColumns('玻璃晴朗，橘子辉煌'), ['玻璃晴朗', '橘子辉煌'])
assert.deepEqual(splitQuoteColumns('我给你瘦落的街道、绝望的落日、荒郊的月亮'), ['我给你瘦落的街道', '绝望的落日', '荒郊的月亮'])
assert.deepEqual(splitQuoteColumns('问苍茫大地，谁主沉浮？'), ['问苍茫大地', '谁主沉浮？'])
assert.equal(splitQuoteColumns('There is no place like 127.0.0.1'), null)
const rows = layoutManuscript({ title: "Lil Polaris'Booook", quote: '在隆冬，我终于得知，我身上有一个不可战胜的夏天', columns: 20 })
assert.deepEqual(rows[0].slice(0, 3), ['L', 'i', 'l']); assert.equal(rows[0][18], '')
assert.ok(rows[1].every(c => c === ''))
assert.deepEqual(rows[2].slice(0, 6), ['', '', '在', '隆', '冬', '，']); assert.equal(rows[2][19], '可')
assert.deepEqual(rows[3].slice(0, 5), ['战', '胜', '的', '夏', '天']); assert.equal(rows.length, 4)
// 避头点：18 个汉字 + '，好'，20 格。第 3 行最后一格是 '十，'（第 18 个字加逗号），第 4 行以 '好' 开头
// 窄屏：同一标题在 columns: 12 时占 2 行（12 + 6）
```

```js
// polaris-home.test.mjs
// tocRows：输入 [置顶 2026-09-02, 2026-10-07, 2026-10-04, 2025-12-31]
//   输出的 type 依次是 post, post, post, year(2025), post
//   第一行 sticky 为 true；第二行 newest 为 true，date 为 '10.07'
// tocRows：嵌套分类 [{name:'校园'}, {name:'大学', parent:'x'}] 时取'校园'
// starField：两次调用 deepEqual；stars.length === 20；所有坐标在范围内
```

- [ ] **Step 2:** 运行 `npm test`，预期 FAIL。
- [ ] **Step 3:** 实现 `polaris-quote-core.js`（UMD，全局名 `PolarisQuote`）和 `scripts/lib/polaris-home.js`；在 `scripts/polaris-helpers.js` 注册三个 helper。
- [ ] **Step 4:** 运行 `npm test`，预期 PASS。
- [ ] **Step 5:** 在 site check 里加会失败的 test：
  - `index.html` 有 `.polaris-hero`；
  - `#polaris-quotes` 解析出来的数组长度等于 `_config.butterfly.yml` 里 `subtitle.sub` 的条数；
  - `.polaris-hero__quote` 在生成时就有文字（无 JS 也能看到引文）；
  - `li.polaris-toc__row` 的数量等于文章总数（30 篇以内都在第一页）；
  - 第一行含"置顶"；
  - 没有 `.recent-post-item`。
- [ ] **Step 6:** 写 `theme-overrides/index.pug`、`polaris-home.js` 和 `polaris-home.css`。
  - `polaris-home.js` 的工作：
    - 随机选一句引文；
    - 竖排时按 `splitQuoteColumns` 分列，返回 `null` 时改为横排；
    - 当前主题是稿纸时，用 `layoutManuscript` 渲染网格：容器宽度 ≥ 560px 用 20 格，否则 12 格；
    - 监听窗口大小变化和主题切换（`MutationObserver` 观察 `data-polaris-theme`），然后重排；
    - 网格渲染好后给 hero 加上 `is-manuscript-ready`。
  - CSS：
    - 冷色主题下，夜晚显示星空，白天隐藏；
    - 目录行用 `grid-template-columns: 60px minmax(0,1fr) auto`，标题列加 `overflow-wrap: anywhere`；
    - 窄于 600px 时，标题拆成两行。
- [ ] **Step 7:** 运行 `npm run test:site`，预期 PASS。
- [ ] **Step 8:** 提交：`feat: build quiet homepage with vertical quote and table of contents`

### Task 6: 文章页

**Files:**
- Create: `theme-overrides/post.pug`
- Create: `theme-overrides/includes/header/post-info.pug`
- Modify: `scripts/polaris-helpers.js`（加 `polaris_is_tutorial(page): boolean`，判断顶层分类是不是"教程"）
- Modify: `source/js/reading-tools.js`
- Create: `source/js/polaris-share.js`
- Create: `source/css/polaris-article.css`
- Modify: `_config.butterfly.yml`（`inject` 加上 article 的 css 和 share 的 js）
- Modify: `tools/site-build.check.mjs`

**Interfaces:**
- Consumes: Task 4 的 `#polaris-font-size`，Task 3 的变量。
- Produces:
  - 元信息行 `#post-meta.polaris-post-meta`，依次是：
    - 发表日期 `YYYY 年 M 月 D 日`；
    - 教程文章另加 `更新于 YYYY 年 M 月 D 日`；
    - 顶层分类链接；
    - `${wordcount(page.content)} 字`；
    - `约 ${min2read(page.content, {cn: 350, en: 160})} 分钟`；
    - `#busuanzi_value_page_pv` + ` 次浏览`。
  - 文末：
    - `.polaris-post-end__row`：左边是标签，右边是 `button#polaris-share-toggle[aria-expanded][aria-controls=polaris-share-icons]`；`#polaris-share-icons` 默认 `hidden`，里面包着 Butterfly 的 share 输出；
    - `p.polaris-post-end__license`：`本文采用 <a href=license_url>CC BY-NC-SA 4.0</a> 许可`；
    - 文章有 `series` 时输出 `nav.polaris-series`，列表用现有的 `groupPosts()[page.series]`；
    - `nav.polaris-post-nav`：上一篇 = `page.next`（更早的一篇），下一篇 = `page.prev`（更新的一篇），和现在 `post_pagination: 1` 的方向一致；
    - 评论区：用原来的 comments partial。
  - 过期提示只在 `polaris_is_tutorial(page)` 为真时 include。

- [ ] **Step 1:** 在 site check 里写会失败的 test：
  - `posts/why-i-blog/` 页面：没有 `.post-copyright`、`.relatedPosts`、`.post-reward`、`#post-outdate-notice`；元信息里有"字"、"分钟"、"次浏览"，没有"更新于"；有 `#polaris-share-toggle`，并且 `#polaris-share-icons` 带 `hidden`；有"CC BY-NC-SA 4.0"；`.polaris-post-nav` 里有两个链接；
  - `posts/astrbot-chat-qq-setup-guide/` 页面：有 `#post-outdate-notice`，元信息里有"更新于"；
  - `posts/Student-Digital-Survival-Guide-1/` 页面：有 `.polaris-series`，并且里面有指向 `Student-Digital-Survival-Guide-0` 的链接。
- [ ] **Step 2:** 运行 `npm run test:site`，预期 FAIL。
- [ ] **Step 3:** 写两个 pug 覆盖文件和 `polaris_is_tutorial`。
- [ ] **Step 4:** 改 `reading-tools.js`：
  - 删掉正文上方的工具条；
  - 改为由 `#polaris-font-size` 打开 `#polaris-font-size-panel`，里面三个按钮（标准 16、较大 18、大号 20），用 `aria-pressed` 标记当前项；
  - 原来焦点回到工具条按钮的地方，改为让 `#article-container` 获得焦点（需要时设 `tabindex=-1`）；
  - 存储键名和阅读进度逻辑不变。
- [ ] **Step 5:** 写 `polaris-share.js`：切换 `hidden` 和 `aria-expanded`，按 Esc 收起。
- [ ] **Step 6:** 写 `polaris-article.css`：
  - 单栏 `max-width: 38em`，16–17px，行高约 2，段间距 1.1em；
  - `hr` 是一颗用 `mask-image` 画的四角星，颜色取 `--p-accent`；
  - 分享图标统一灰色，覆盖 sharejs 的品牌色；
  - 代码块、引用块、表格改用新变量；
  - 去掉灰色页头遗留的空白。
- [ ] **Step 7:** 运行 `npm run test:site` 和 `npm test`，预期 PASS。
- [ ] **Step 8:** 提交：`feat: single-column article page with quiet meta and folded share`

### Task 7: 小志和稿纸的装饰与夜晚

**Files:**
- Create: `source/css/polaris-zine.css`
- Create: `source/css/polaris-manuscript.css`
- Modify: `theme-overrides/index.pug`（如果 Task 5 还没输出装饰用的 SVG，在这里补上）
- Modify: `_config.butterfly.yml`（`inject` 加上这两个 css）

**Interfaces:**
- Consumes: Task 5 的 DOM 和 `is-manuscript-ready`，Task 3 的 `--p-spot`、`--p-grid`、`--p-grid-soft`、`--p-font-hand`。

- [ ] **Step 1:** 小志：
  - 标题分两行，约 44px，`mix-blend-mode: multiply`；
  - 黄星（`.polaris-hero__zine-star`）是黄色填充加错位的蓝色描边，旋转 −5°；
  - 引文、日期、"最近写的"改用 `var(--p-font-hand)`；
  - `.polaris-toc__row.is-newest` 的日期加一个手绘圈；
  - 页脚上边框换成波浪线（SVG data URI）；
  - `body::after` 铺一层约 12% 的颗粒（feTurbulence），并设 `pointer-events: none`；
  - 夜晚改用夜晚的变量，颗粒改成 `screen` 混合或者直接关掉。
- [ ] **Step 2:** 稿纸：
  - 网格的格线用 `--p-grid`，格子里的字用 `var(--p-font-hand)`；
  - 网格右下方加"20×20＝400"，网格列数是 12 时写"12×12＝144"；
  - `is-manuscript-ready` 之后，隐藏横排的标题和引文，但标题仍保留在无障碍树里；
  - 目录行之间用 `--p-grid-soft` 细线。
- [ ] **Step 3:** 运行 `npm run test:site` 和 `npm test`，确认没有破坏已有测试。
- [ ] **Step 4:** 提交：`feat: add zine and manuscript theme decorations`

### Task 8: 其他页面与旧样式退役

**Files:**
- Delete: `source/css/site-polish.css`（有用的规则已在 Task 4、6 迁移完）
- Modify: `source/css/guestbook.css`（颜色改用 `--p-*`）
- Modify: `source/css/polaris-base.css`（归档、分类、标签、404、关于页的列表和标题）
- Modify: `tools/site-build.check.mjs`

- [ ] **Step 1:** 在 site check 里写会失败的 test：所有生成的 html 里都不再出现 `site-polish.css` 和 `data-polaris-palette`；`guestbook/index.html` 仍然引用 `guestbook.css`。
- [ ] **Step 2:** 用 `grep` 找出 `site-polish.css` 里还没迁移、但仍有用的规则（表格、标签云、归档列表、搜索结果），迁移到 `polaris-base.css`，然后删除旧文件。
- [ ] **Step 3:** `guestbook.css` 里写死的颜色换成变量；画板的底色在五个主题下都要和笔色有足够对比。
- [ ] **Step 4:** 运行 `npm run test:site`、`npm test`、`node --test tools/guestbook.test.mjs`，预期 PASS。
- [ ] **Step 5:** 提交：`refactor: retire site-polish.css and theme remaining pages`

### Task 9: 浏览器验收

**Files:**
- Create: `.claude/launch.json`（`hexo server`，端口 4000）
- 只在发现问题时修改对应文件

- [ ] **Step 1:** 用 `preview_start` 启动本地服务。依次检查首页、`posts/why-i-blog/`、`posts/how-to-make-a-book/`（有代码块）、`guestbook/`、`archives/`：
  - 五个主题 × 白天/夜晚 × 桌面 1366px / 手机 375px；
  - 每种组合截图。
- [ ] **Step 2:** 手机 375px 下逐页确认：没有横向滚动（`document.documentElement.scrollWidth <= innerWidth`），《大一下总结》的长标题能折行。
- [ ] **Step 3:** 模拟 `prefers-reduced-motion: reduce`，确认星空和过渡都是静止的。关闭 JavaScript 打开首页，确认引文和目录都可见。
- [ ] **Step 4:** 用键盘走一遍：Tab 能依次到达搜索、换主题面板、字号面板、分享按钮，Esc 能关闭面板并把焦点还给按钮。
- [ ] **Step 5:** 把小志夜晚和稿纸夜晚的截图，以及 Task 3 Step 6 调整过的色值，一起汇报给用户确认。
- [ ] **Step 6:** 修完所有问题后，跑一遍 `npm test`、`npm run test:site`、`cd admin && npm test`，全部 PASS。最后提交：`fix: visual polish from browser review`
