# LilPolaris Blog Admin

独立部署的个人 Hexo 管理后台。完整配置、权限和部署步骤见仓库根目录 [README](../README.md)。

编辑器默认提供 Obsidian 风格 Live Preview，也可切换到完整 Markdown
源码。支持直接粘贴/拖入图片、IndexedDB 离线恢复、正文与图片原子提交、
快捷文章模板及常用标签分类建议。默认编辑模式和最多 8 个模板可直接在
“设置”页面调整，无需修改配置文件。

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
