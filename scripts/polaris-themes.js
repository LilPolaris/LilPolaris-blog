'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildTokenCss, buildBootScript } = require('./lib/polaris-themes')

const loadConfig = () => JSON.parse(fs.readFileSync(path.join(hexo.source_dir, '_data', 'polaris-themes.json'), 'utf8'))

hexo.extend.generator.register('polaris-tokens', () => ({
  path: 'css/polaris-tokens.css',
  data: buildTokenCss(loadConfig())
}))

// Still inside <head>, so the theme is chosen before first paint; head_end
// keeps <meta charset> within the first 1024 bytes.
hexo.extend.injector.register('head_end', () => `<script>${buildBootScript(loadConfig())}</script>`)

const styles = [
  'css/polaris-tokens.css',
  'fonts/noto-serif-sc/400.css',
  'fonts/noto-serif-sc/500.css',
  'fonts/long-cang/400.css',
  'fonts/ma-shan-zheng/400.css'
]
hexo.extend.injector.register('head_end', () =>
  styles.map(href => `<link rel="stylesheet" href="${hexo.config.root}${href}">`).join(''))
