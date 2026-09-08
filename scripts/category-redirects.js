'use strict'

// Keep bookmarks to the former category hierarchy usable on static hosting.
hexo.extend.generator.register('legacy-course-categories', () =>
  ['大学', '大学/课程测评'].map(category => {
    const target = `/categories/${encodeURI(`校园/${category}`)}/`
    return {
      path: `categories/${category}/index.html`,
      data: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>分类已迁移</title><link rel="canonical" href="${hexo.config.url.replace(/\/$/, '')}${target}"><meta http-equiv="refresh" content="0;url=${target}"></head><body><p>分类已迁移至 <a href="${target}">校园 → ${category.replace('/', ' → ')}</a></p></body></html>`
    }
  })
)
