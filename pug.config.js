'use strict'

// hexo-renderer-pug loads this file from the working directory. Butterfly
// pulls most templates in with include/extends, which pug reads straight from
// disk, so the view registry override in scripts/theme-overrides.js cannot
// reach them. This resolve hook sends any include of a theme layout file to
// its twin under theme-overrides/ when one exists, and lets includes written
// inside an override fall back to the theme's own files.
const fs = require('node:fs')
const path = require('node:path')

const themeLayout = path.join(__dirname, 'themes', 'butterfly', 'layout')
const overrides = path.join(__dirname, 'theme-overrides')

const relativeInside = (dir, file) => {
  const rel = path.relative(dir, file)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : null
}

function resolve (filename, source, options) {
  filename = filename.trim()
  if (filename[0] === '/' && !options.basedir) {
    throw new Error('the "basedir" option is required to use includes and extends with "absolute" paths')
  }
  const target = path.join(filename[0] === '/' ? options.basedir : path.dirname(source.trim()), filename)

  const fromTheme = relativeInside(themeLayout, target)
  if (fromTheme !== null) {
    const shadow = path.join(overrides, fromTheme)
    return fs.existsSync(shadow) ? shadow : target
  }
  const fromOverride = relativeInside(overrides, target)
  if (fromOverride !== null && !fs.existsSync(target)) return path.join(themeLayout, fromOverride)
  return target
}

module.exports = { compile: { plugins: [{ resolve }] } }
