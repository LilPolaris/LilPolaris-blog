'use strict'

// Essays are written one paragraph per line with a single newline between
// them, which marked renders as one paragraph full of <br>. Insert a blank
// line between two adjacent prose lines so each line becomes its own
// paragraph. Code, math, HTML, Hexo tag blocks, lists, tables, quotes and
// headings are left exactly as written.
// admin/src/lib/prose-paragraphs.ts mirrors this; both are tested against
// tools/fixtures/prose-paragraphs.cases.json.

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_START = /^(#{1,6}(\s|$)|[-*+]\s|\d+[.)]\s|>|\||\[\^|\[[^\]]+\]:\s)/
const RULE = /^(-{3,}|={3,}|\*{3,}|_{3,})\s*$/
const HTML = /^<[A-Za-z!/]/
const TAG = /^\{%\s*(\w+)/

function splitProseLines (markdown) {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const prose = new Array(lines.length).fill(false)
  let fence = null
  let math = false
  let html = false
  let tagBlock = null

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (fence) {
      const close = trimmed.match(/^(`{3,}|~{3,})$/)
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null
      return
    }
    if (math) {
      if (trimmed === '$$') math = false
      return
    }
    if (tagBlock) {
      if (new RegExp(`^\\{%\\s*end${tagBlock}\\s*%\\}`).test(trimmed)) tagBlock = null
      return
    }
    if (html) {
      if (!trimmed) html = false
      return
    }
    if (!trimmed) return

    const fenceOpen = line.match(FENCE)
    if (fenceOpen) {
      fence = fenceOpen[1]
      return
    }
    if (trimmed.startsWith('$$')) {
      if (trimmed === '$$') math = true
      return
    }
    const tag = line.match(TAG)
    if (tag) {
      const end = new RegExp(`^\\{%\\s*end${tag[1]}\\s*%\\}`)
      if (lines.slice(index + 1).some(next => end.test(next.trim()))) tagBlock = tag[1]
      return
    }
    if (HTML.test(line)) {
      html = true
      return
    }
    if (/^\s/.test(line) || BLOCK_START.test(line) || RULE.test(line)) return
    prose[index] = true
  })

  const output = []
  lines.forEach((line, index) => {
    output.push(line)
    const hardBreak = / {2,}$|\\$/.test(line)
    if (prose[index] && prose[index + 1] && !hardBreak) output.push('')
  })
  return output.join(eol)
}

module.exports = { splitProseLines }
