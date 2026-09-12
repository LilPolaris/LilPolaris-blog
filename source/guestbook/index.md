---
title: 留言墙
date: 2026-09-08
comments: false
aside: false
top_img: false
---

<link rel="stylesheet" href="/css/guestbook.css">
<div id="guestbook">
  <header class="gb-intro"><p class="gb-eyebrow">YOU WERE HERE</p><h2>留下一点你的痕迹。</h2><p>画个小人，写句废话，或者认真打个招呼。</p></header>
  <section class="gb-wall-section" aria-labelledby="gb-wall-heading">
    <div class="gb-section-heading"><h3 id="gb-wall-heading">留言正在经过</h3><div><button id="gb-pause" type="button" aria-pressed="false">暂停弹幕</button><button id="gb-fullscreen" type="button">全屏看墙</button></div></div>
    <div id="gb-wall" aria-label="已审核的弹幕留言"><p class="gb-wall-empty">这里还很安静，等第一句问候经过。</p></div>
    <p class="gb-hint">悬停可暂停。所有留言也能在下方静态列表里阅读。</p>
    <details><summary>逐条看留言</summary><div id="gb-messages"><p>还没有审核通过的留言。</p></div></details>
  </section>
  <section class="gb-create" aria-labelledby="gb-create-heading">
    <div class="gb-section-heading"><h3 id="gb-create-heading">到此一游</h3><div role="group" aria-label="投稿类型"><button id="gb-drawing-mode" type="button" aria-pressed="true">画一张</button><button id="gb-message-mode" type="button" aria-pressed="false">留句话</button></div></div>
    <div id="gb-drawing-area">
      <div class="gb-tools"><div id="gb-colors" role="group" aria-label="画笔颜色"></div><label>笔尖 <select id="gb-width"><option value="3">细</option><option value="7" selected>中</option><option value="14">粗</option><option value="24">很粗</option></select></label><button id="gb-undo" type="button">撤销</button><button id="gb-clear" type="button">清空</button><button id="gb-download" type="button">保存图片</button></div>
      <canvas id="gb-canvas" width="960" height="600" aria-label="涂鸦画布，用鼠标、触控笔或手指绘画；也可切换留句话使用键盘投稿"></canvas>
      <p class="gb-hint">不用画得好看。草稿只保存在这台设备；清空后也能撤销。</p>
    </div>
    <form id="gb-form"><div class="gb-fields"><label>怎么称呼你<input id="gb-name" maxlength="24" required autocomplete="nickname" placeholder="留个昵称"></label><label>想说的话 <span id="gb-count">0 / 120</span><textarea id="gb-message" maxlength="120" rows="3" placeholder="给路过的人留一句话……"></textarea></label></div><button class="gb-primary" id="gb-submit" type="submit">预览并投稿</button><p class="gb-hint">使用 GitHub 登录投稿，博主审核后上墙。投稿内容会公开保存在 GitHub。</p><p id="gb-status" role="status" aria-live="polite"></p></form>
  </section>
  <section aria-labelledby="gb-gallery-heading"><div class="gb-section-heading"><h3 id="gb-gallery-heading">路过的人留下的画</h3><span id="gb-total"></span></div><div id="gb-gallery"><p class="gb-empty">画廊还没有作品，你可以画下第一张。</p></div></section>
  <dialog id="gb-preview" aria-labelledby="gb-preview-title"><h3 id="gb-preview-title">准备留下这张作品？</h3><canvas id="gb-preview-canvas" width="960" height="600" aria-label="涂鸦预览"></canvas><p id="gb-preview-name"></p><p id="gb-preview-message"></p><p id="gb-preview-hint" class="gb-hint"></p><div class="gb-dialog-actions"><button id="gb-copy" type="button" hidden>复制投稿内容</button><a id="gb-github" class="gb-primary" target="_blank" rel="noopener noreferrer">去 GitHub 提交</a><button id="gb-close-preview" type="button">返回</button></div><textarea id="gb-copy-fallback" readonly hidden aria-label="完整投稿内容，可全选复制"></textarea><section id="gb-review" hidden><p>仅博主在对应投稿下回复以下审核指令才会通过。内容修改后需重新审核。</p><code id="gb-approval"></code><button id="gb-copy-approval" type="button">复制审核指令</button></section></dialog>
  <noscript>画板和弹幕需要 JavaScript。你仍可以<a href="https://github.com/LilPolaris/LilPolaris-blog/issues?q=label%3Aguestbook">浏览 GitHub 投稿</a>。</noscript>
</div>
<script type="module" src="/js/guestbook.mjs"></script>
