import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveTheme, buildTokenCss, buildBootScript } = require('../scripts/lib/polaris-themes.js')
const config = JSON.parse(readFileSync(new URL('../source/_data/polaris-themes.json', import.meta.url), 'utf8'))

const runBoot = storage => {
  const sandbox = { document: { documentElement: { dataset: {} } }, localStorage: storage }
  sandbox.window = sandbox
  vm.runInNewContext(buildBootScript(config), sandbox)
  return sandbox
}

test('resolveTheme prefers a valid stored id', () => {
  assert.equal(resolveTheme('frost', 'mint', config), 'frost')
})

test('resolveTheme maps legacy palettes', () => {
  assert.equal(resolveTheme(null, 'mint', config), 'celadon')
  assert.equal(resolveTheme(null, 'amber', config), 'fog')
})

test('resolveTheme falls back to the default theme', () => {
  assert.equal(resolveTheme('garbage', null, config), 'fog')
  assert.equal(resolveTheme(null, 'unknown', config), 'fog')
})

test('boot script survives blocked storage', () => {
  const sandbox = runBoot({ getItem () { throw new Error('blocked') } })
  assert.equal(sandbox.document.documentElement.dataset.polarisTheme, 'fog')
  assert.equal(sandbox.POLARIS_THEMES.length, 5)
})

test('boot script applies a legacy palette for returning readers', () => {
  const sandbox = runBoot({ getItem: key => (key === 'polaris-palette' ? 'mint' : null) })
  assert.equal(sandbox.document.documentElement.dataset.polarisTheme, 'celadon')
})

test('token css covers every theme and mode', () => {
  const css = buildTokenCss(config)
  for (const theme of config.themes) {
    for (const mode of ['light', 'dark']) {
      assert.ok(css.includes(`html[data-polaris-theme="${theme.id}"][data-theme="${mode}"]`), `${theme.id} ${mode}`)
    }
  }
  // Without JavaScript the boot script never runs; the default theme still applies.
  assert.match(css, /html:not\(\[data-polaris-theme\]\)\[data-theme="light"\]/)
  assert.match(css, /--p-bg:\s*#eef1f2/)
  assert.match(css, /--p-grid-soft:\s*#cfe3d8/)
  assert.match(css, /--p-font-hand:\s*'Long Cang', cursive/)
})

const luminance = hex => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map(part => {
    const c = parseInt(part, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('text colors meet WCAG AA on their background', () => {
  const failures = []
  for (const theme of config.themes) {
    for (const mode of ['light', 'dark']) {
      const tokens = theme[mode]
      for (const key of ['ink', 'muted', 'accent']) {
        const ratio = contrast(tokens[key], tokens.bg)
        if (ratio < 4.5) failures.push(`${theme.id}.${mode}.${key} ${tokens[key]} on ${tokens.bg}: ${ratio.toFixed(2)}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})
