import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { splitQuoteColumns, layoutManuscript } = require('../source/js/polaris-quote-core.js')

test('vertical quotes break at commas and drop the break punctuation', () => {
  assert.deepEqual(splitQuoteColumns('玻璃晴朗，橘子辉煌'), ['玻璃晴朗', '橘子辉煌'])
  assert.deepEqual(splitQuoteColumns('我给你瘦落的街道、绝望的落日、荒郊的月亮'), ['我给你瘦落的街道', '绝望的落日', '荒郊的月亮'])
})

test('vertical quotes keep a closing question mark and drop a closing full stop', () => {
  assert.deepEqual(splitQuoteColumns('问苍茫大地，谁主沉浮？'), ['问苍茫大地', '谁主沉浮？'])
  assert.deepEqual(splitQuoteColumns('一句话。'), ['一句话'])
})

test('quotes without Chinese stay horizontal', () => {
  assert.equal(splitQuoteColumns('There is no place like 127.0.0.1'), null)
})

const title = "Lil Polaris'Booook"

test('manuscript writes the title one character per cell, then a blank row', () => {
  const rows = layoutManuscript({ title, quote: '玻璃晴朗，橘子辉煌', columns: 20 })
  assert.deepEqual(rows[0].slice(0, 3), ['L', 'i', 'l'])
  assert.equal(rows[0][3], '', 'a space is an empty cell')
  assert.equal(rows[0][18], '')
  assert.ok(rows[1].every(cell => cell === ''))
  assert.ok(rows.every(row => row.length === 20))
})

test('manuscript indents the quote two cells and wraps it', () => {
  const rows = layoutManuscript({ title, quote: '在隆冬，我终于得知，我身上有一个不可战胜的夏天', columns: 20 })
  assert.deepEqual(rows[2].slice(0, 6), ['', '', '在', '隆', '冬', '，'])
  assert.equal(rows[2][19], '可')
  assert.deepEqual(rows[3].slice(0, 5), ['战', '胜', '的', '夏', '天'])
  assert.equal(rows.length, 4)
})

test('manuscript never starts a row with closing punctuation', () => {
  const rows = layoutManuscript({ title, quote: '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未，好', columns: 20 })
  assert.equal(rows[2][19], '未，')
  assert.equal(rows[3][0], '好')
})

test('manuscript wraps the title on narrow screens', () => {
  const rows = layoutManuscript({ title, quote: '玻璃晴朗，橘子辉煌', columns: 12 })
  assert.equal(rows[1].slice(0, 6).join(''), 'Booook')
  assert.ok(rows[2].every(cell => cell === ''))
  assert.ok(rows.every(row => row.length === 12))
})
