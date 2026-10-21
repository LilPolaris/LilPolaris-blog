'use strict'

// Theme data lives in source/_data/polaris-themes.json. From it the build
// emits the colour/font custom properties and a tiny <head> script that picks
// the reader's theme before first paint.

// Inlined into the boot script with toString(), so it must stay
// self-contained ES5 with no outside references.
function resolveTheme (stored, legacy, config) {
  var ids = config.themes.map(function (theme) { return theme.id })
  if (ids.indexOf(stored) !== -1) return stored
  var mapped = Object.prototype.hasOwnProperty.call(config.legacyMap, legacy) ? config.legacyMap[legacy] : null
  if (ids.indexOf(mapped) !== -1) return mapped
  return config.default
}

const kebab = key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)

const declarations = (tokens, fonts, mode) => [
  ...Object.entries(tokens).map(([key, value]) => `--p-${kebab(key)}: ${value};`),
  ...Object.entries(fonts).map(([key, value]) => `--p-font-${kebab(key)}: ${value};`),
  `color-scheme: ${mode};`
].join(' ')

function buildTokenCss (config) {
  return config.themes.flatMap(theme => ['light', 'dark'].map(mode => {
    const selectors = [`html[data-polaris-theme="${theme.id}"][data-theme="${mode}"]`]
    if (theme.id === config.default) selectors.push(`html:not([data-polaris-theme])[data-theme="${mode}"]`)
    return `${selectors.join(',\n')} { ${declarations(theme[mode], theme.fonts, mode)} }`
  })).join('\n')
}

function buildBootScript (config) {
  const data = {
    default: config.default,
    storageKey: config.storageKey,
    legacyKey: config.legacyKey,
    legacyMap: config.legacyMap,
    themes: config.themes.map(({ id, name, light, dark }) => ({
      id, name, light: { bg: light.bg, accent: light.accent }, dark: { bg: dark.bg, accent: dark.accent }
    }))
  }
  return `(function () {
var config = ${JSON.stringify(data).replace(/</g, '\\u003c')};
${resolveTheme.toString()}
var stored = null, legacy = null;
try { stored = localStorage.getItem(config.storageKey); legacy = localStorage.getItem(config.legacyKey) } catch (e) {}
document.documentElement.dataset.polarisTheme = resolveTheme(stored, legacy, config);
window.POLARIS_THEMES = config.themes;
window.POLARIS_THEME_KEY = config.storageKey;
}());`
}

module.exports = { resolveTheme, buildTokenCss, buildBootScript }
