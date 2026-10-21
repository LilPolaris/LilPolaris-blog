'use strict'

// Butterfly is a git submodule that CI checks out from upstream, so edits
// inside it never deploy. Templates under theme-overrides/ mirror the theme's
// layout/ tree and replace the view of the same path before each generate.
// Relative includes inside them still resolve against the theme's layout/.
const fs = require('node:fs')
const path = require('node:path')

const overrideDir = path.join(hexo.base_dir, 'theme-overrides')

const listViews = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return listViews(full)
  return entry.name.endsWith('.pug') ? [full] : []
})

hexo.extend.filter.register('before_generate', () => {
  if (!fs.existsSync(overrideDir)) return
  for (const file of listViews(overrideDir)) {
    const view = path.relative(overrideDir, file).split(path.sep).join('/')
    hexo.theme.setView(view, fs.readFileSync(file, 'utf8'))
  }
})
