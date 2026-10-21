'use strict'

// Rows for the home page table of contents. Posts arrive already sorted by
// hexo-generator-index (sticky first, then newest), with dates formatted in
// the site timezone by the caller.
function tocRows (posts, { markNewest }) {
  const rows = []
  let lastYear = null
  let newestPending = markNewest
  for (const post of posts) {
    const sticky = Number(post.sticky) > 0
    if (!sticky) {
      if (lastYear !== null && post.year !== lastYear) rows.push({ type: 'year', year: post.year })
      lastYear = post.year
    }
    const top = post.categories.find(category => !category.parent)
    const newest = !sticky && newestPending
    if (newest) newestPending = false
    rows.push({
      type: 'post',
      title: post.title,
      path: post.path,
      date: post.date,
      sticky,
      newest,
      category: top ? { name: top.name, path: top.path } : null
    })
  }
  return rows
}

const hashSeed = text => {
  let hash = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return hash >>> 0
}

const mulberry32 = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const round = (value, digits) => Number(value.toFixed(digits))

// A sparse, repeatable sky: the same seed always draws the same stars.
function starField ({ count, seed, width, height }) {
  const random = mulberry32(hashSeed(seed))
  const stars = Array.from({ length: count }, () => ({
    x: round(random() * width, 1),
    y: round(random() * height, 1),
    r: round(0.5 + random() * 0.6, 2),
    opacity: round(0.25 + random() * 0.35, 2)
  }))
  return { stars, polaris: { x: round(0.79 * width, 1), y: round(0.25 * height, 1) } }
}

module.exports = { tocRows, starField }
