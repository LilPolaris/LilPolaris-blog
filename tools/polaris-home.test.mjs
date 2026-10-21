import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { tocRows, starField } = require('../scripts/lib/polaris-home.js')

const essay = { name: '随笔', path: 'categories/随笔/' }
const posts = [
  { title: '我为什么要写博客', path: 'posts/why-i-blog/', date: '09.02', year: 2026, sticky: 1, categories: [essay] },
  { title: '随笔-06', path: 'posts/rambling-06/', date: '10.07', year: 2026, categories: [essay] },
  { title: '随笔-05', path: 'posts/rambling-05/', date: '10.04', year: 2026, categories: [essay] },
  {
    title: '旧文',
    path: 'posts/old/',
    date: '12.31',
    year: 2025,
    categories: [{ name: '大学', path: 'categories/校园/大学/', parent: 'campus' }, { name: '校园', path: 'categories/校园/' }]
  }
]

test('tocRows keeps sticky posts first and marks a year change', () => {
  const rows = tocRows(posts, { markNewest: true })
  assert.deepEqual(rows.map(row => row.type), ['post', 'post', 'post', 'year', 'post'])
  assert.equal(rows[0].sticky, true)
  assert.equal(rows[3].year, 2025)
})

test('tocRows marks the newest non-sticky post only on request', () => {
  assert.equal(tocRows(posts, { markNewest: true })[1].newest, true)
  assert.equal(tocRows(posts, { markNewest: true })[2].newest, false)
  assert.equal(tocRows(posts, { markNewest: false })[1].newest, false)
  assert.equal(tocRows(posts, { markNewest: true })[1].date, '10.07')
})

test('tocRows shows the top-level category', () => {
  assert.deepEqual(tocRows(posts, { markNewest: false })[4].category, { name: '校园', path: 'categories/校园/' })
})

test('tocRows tolerates posts without a category', () => {
  const rows = tocRows([{ title: '无分类', path: 'posts/x/', date: '01.01', year: 2026, categories: [] }], { markNewest: false })
  assert.equal(rows[0].category, null)
})

test('starField is deterministic and stays inside the sky', () => {
  const options = { count: 20, seed: 'polaris', width: 680, height: 300 }
  const sky = starField(options)
  assert.deepEqual(starField(options), sky)
  assert.equal(sky.stars.length, 20)
  for (const star of sky.stars) {
    assert.ok(star.x >= 0 && star.x <= 680 && star.y >= 0 && star.y <= 300)
    assert.ok(star.r >= 0.5 && star.r <= 1.1)
    assert.ok(star.opacity >= 0.25 && star.opacity <= 0.6)
  }
  assert.deepEqual(sky.polaris, { x: 537.2, y: 75 })
})
