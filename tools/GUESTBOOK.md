# 留言墙使用与审核

## 访客投稿

进入 `/guestbook/`，选择“画一张”或“留句话”，填写昵称并预览，然后去 GitHub 确认提交。
复杂涂鸦可能需要先复制完整投稿内容，在 GitHub 正文里替换粘贴后提交。
投稿公开保存在 `LilPolaris/LilPolaris-blog` 的 Issues 中，但审核前不会显示在博客墙上。
草稿只存在访客当前浏览器。画板支持撤销（包括清空）、颜色、粗细和 PNG 下载。

## 博主审核

1. 打开仓库中的 `guestbook` 标签投稿。
2. 点击正文里的“查看完整投稿预览”，核对涂鸦、昵称和留言。
3. 点击“复制审核指令”，回到**该条投稿**下，用 `LilPolaris` 账号评论粘贴的完整指令。
4. 等待 `Deploy Hexo Site` 和 GitHub Pages 发布完成，作品会出现在画廊；附带文字也进入弹幕。

只有仓库所有者 `LilPolaris` 的审核指令有效。指令与完整投稿数据的 SHA-256 绑定。
投稿数据修改后，旧指令不再有效；重新打开新的投稿预览并审核即可。

## 撤下或拒绝

- 关闭该 Issue，或者由 `LilPolaris` 评论 `/reject-guestbook`，会在下一次自动发布后撤下。
- 移除 `guestbook` 标签或删除审核评论也会触发重新发布并重新计算展示内容。
- 若需要恢复已关闭作品，重新打开 Issue 会重新使用仍有效的审核指令；若要彻底撤销，请用拒绝指令。
- Actions 失败时不会发布半份数据；修复后手动运行 `Deploy Hexo Site` 重试。
- 变更会在部署完成后生效，不是即时审核。不要把不愿公开的内容写进投稿或画布。

## 本地验证

```powershell
node --test tools/guestbook.test.mjs
node tools/export-guestbook.mjs
npm run build
```

`export-guestbook.mjs` 使用 GitHub API 读取投稿及审核；CI 使用内置的只读 `GITHUB_TOKEN`。
无新 API 密钥、数据库或收费服务。公共墙只加载站内 `entries.json`，不直接向 GitHub 拉取未审核内容。
本地导出可不设置 token，受 GitHub 公共 API 配额限制；`.guestbook-cache.json` 是忽略的生成文件。
