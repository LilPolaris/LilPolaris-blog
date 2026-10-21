import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { splitProseLines } = require('../scripts/lib/prose-paragraphs.js')
const cases = JSON.parse(readFileSync(new URL('./fixtures/prose-paragraphs.cases.json', import.meta.url), 'utf8'))

for (const { name, input, expected } of cases) {
  test(`splitProseLines: ${name}`, () => {
    assert.equal(splitProseLines(input), expected)
  })
}
