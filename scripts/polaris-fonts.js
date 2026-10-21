'use strict'

// Publish the self-hosted fonts from node_modules instead of committing them.
// Each @fontsource stylesheet splits a CJK font into unicode-range slices, so
// browsers only download the slices a page actually uses. Only woff2 is kept.
const fs = require('node:fs')
const path = require('node:path')

const fonts = [
  ['noto-serif-sc', ['400', '500']],
  ['long-cang', ['400']],
  ['ma-shan-zheng', ['400']]
]
const woffFallback = /,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g

hexo.extend.generator.register('polaris-fonts', () => fonts.flatMap(([name, weights]) => {
  const dir = path.dirname(require.resolve(`@fontsource/${name}/package.json`))
  return weights.flatMap(weight => {
    const css = fs.readFileSync(path.join(dir, `${weight}.css`), 'utf8').replace(woffFallback, '')
    const files = [...css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)].map(match => match[1])
    return [
      { path: `fonts/${name}/${weight}.css`, data: css },
      ...files.map(file => ({
        path: `fonts/${name}/files/${file}`,
        data: () => fs.createReadStream(path.join(dir, 'files', file))
      }))
    ]
  })
}))
