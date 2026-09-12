import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { parseSubmission, digest, approvedEntry } from './guestbook-lib.mjs'
import { validateEntry } from '../source/js/guestbook-format.mjs'

const drawing = { version: 1, kind: 'drawing', name: '访客', message: '你好', strokes: [{color: '#327a72', width: 7, points: [[10, 20], [100, 200]]}] }
const message = { ...drawing, kind: 'message', strokes: [] }
const encode = (value, zip = true) => (zip ? 'g.' : 'j.') + (zip ? gzipSync(Buffer.from(JSON.stringify(value))) : Buffer.from(JSON.stringify(value))).toString('base64url')
const body = payload => `<!-- polaris-guestbook:v1\n${payload}\n-->`
const payload = encode(drawing)
const issue = { number: 42, state: 'open', labels: [{name: 'guestbook'}], user: {login: 'visitor'}, body: body(payload) }
const approval = { id: 1, user: { login: 'LilPolaris' }, body: `/approve-guestbook ${digest(payload)}`, updated_at: '2026-09-12T01:00:00Z' }

test('compressed drawing and plain text submission round-trip', () => {
  assert.deepEqual(parseSubmission(body(payload)).entry, drawing)
  assert.deepEqual(parseSubmission(body(encode(message, false))).entry, message)
})
test('only matching owner approval publishes the entry', () => {
  assert.equal(approvedEntry(issue, []), null)
})
test('owner approval returns a safe public record', () => {
  const result = approvedEntry(issue, [approval])
  assert.equal(result.id, 42)
  assert.equal(result.author, 'visitor')
  assert.equal(result.url, 'https://github.com/LilPolaris/LilPolaris-blog/issues/42')
  assert.deepEqual(result.strokes, drawing.strokes)
})
test('visitor cannot self-approve even by claiming owner association', () => {
  assert.equal(approvedEntry(issue, [{...approval, user: {login: 'visitor'}, author_association: 'OWNER'}]), null)
})
test('editing payload invalidates the prior approval', () => {
  const edited = {...issue, body: body(encode({...drawing, message: '改过的留言'}))}
  assert.equal(approvedEntry(edited, [approval]), null)
})
test('rejection, closed issue, removed label, PR, deleted approval do not publish', () => {
  const rejection = {...approval, id: 2, body: '/reject-guestbook', updated_at: '2026-09-12T02:00:00Z'}
  assert.equal(approvedEntry(issue, [approval, rejection]), null)
  assert.equal(approvedEntry({...issue, state: 'closed'}, [approval]), null)
  assert.equal(approvedEntry({...issue, labels: []}, [approval]), null)
  assert.equal(approvedEntry({...issue, pull_request: {}}, [approval]), null)
  assert.equal(approvedEntry(issue, []), null)
})
test('editing an approval to rejection takes precedence over older approval', () => {
  const old = {...approval, id: 2, updated_at: '2026-09-12T02:00:00Z'}
  const edited = {...approval, body: '/reject-guestbook', updated_at: '2026-09-12T03:00:00Z'}
  assert.equal(approvedEntry(issue, [edited, old]), null)
})
test('mismatched preview and payload cannot share an approval', () => {
  const altered = encode({...drawing, name: '其他内容'})
  assert.equal(approvedEntry({...issue, body: `[预览](https://example.com/#review=${payload})\n${body(altered)}`}, [approval]), null)
})
test('invalid JSON, duplicate markers and decompression bombs are rejected', () => {
  assert.throws(() => parseSubmission(body('g.invalid')))
  assert.throws(() => parseSubmission(body(payload) + body(payload)))
  assert.throws(() => parseSubmission(body('g.' + gzipSync(Buffer.from('x'.repeat(100000))).toString('base64url'))))
  assert.throws(() => parseSubmission(body('j.' + Buffer.from('not JSON').toString('base64url'))))
})
test('paint data is bounded and never accepts arbitrary CSS or SVG', () => {
  for (const strokes of [
    [{color: 'url(https://evil.example)', width: 7, points: [[1, 2]]}],
    [{color: '#327a72', width: 1000, points: [[1, 2]]}],
    [{color: '#327a72', width: 7, points: [[-1, 2]]}],
    [{color: '#327a72', width: 7, points: [[1, Infinity]]}],
    [{color: '#327a72', width: 7, points: Array(1201).fill([1, 2])}],
    Array(101).fill(drawing.strokes[0])
  ]) assert.throws(() => validateEntry({...drawing, strokes}))
})
test('blank submissions and overly long text are rejected', () => {
  assert.throws(() => validateEntry({...message, message: '   '}))
  assert.throws(() => validateEntry({...message, name: ''}))
  assert.throws(() => validateEntry({...message, message: 'x'.repeat(121)}))
  assert.throws(() => validateEntry({...drawing, strokes: []}))
})
test('extra fields never reach the published schema', () => {
  assert.equal(validateEntry({...message, html: '<script>alert(1)</script>', url: 'javascript:alert(1)'}).html, undefined)
})
test('workflow uses trusted main and read-only permissions for issue content', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  assert.match(workflow, /ref: main/)
  assert.match(workflow, /issues: read/)
  assert.doesNotMatch(workflow, /\$\{\{\s*github\.event\.(issue|comment)\.body/)
  assert.match(workflow, /node tools\/export-guestbook\.mjs/)
})
