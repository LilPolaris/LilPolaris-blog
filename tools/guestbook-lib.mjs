import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { validateEntry } from '../source/js/guestbook-format.mjs'

export const digest = payload => createHash('sha256').update(payload).digest('hex')

export function parseSubmission(body) {
  if (typeof body !== 'string' || body.length > 65536) throw Error('Invalid body')
  const matches = [...body.matchAll(/<!-- polaris-guestbook:v1\s+([gj]\.[A-Za-z0-9_-]+)\s+-->/g)]
  if (matches.length !== 1) throw Error('Expected one submission')
  const payload = matches[0][1]
  if (payload.length > 24000) throw Error('Payload too large')
  const bytes = Buffer.from(payload.slice(2), 'base64url')
  const json = payload.startsWith('g.') ? gunzipSync(bytes, { maxOutputLength: 65536 }) : bytes
  if (json.length > 65536) throw Error('Decoded payload too large')
  return { entry: validateEntry(JSON.parse(json.toString('utf8'))), hash: digest(payload) }
}

export function approvedEntry(issue, comments, owner = 'LilPolaris') {
  if (issue.pull_request || issue.state !== 'open' || !issue.labels?.some(label => label.name === 'guestbook')) return null
  let parsed
  try { parsed = parseSubmission(issue.body) } catch { return null }
  const decisions = comments.filter(comment => comment.user?.login?.toLowerCase() === owner.toLowerCase() && typeof comment.body === 'string' && /^\/(?:approve-guestbook [a-f0-9]{64}|reject-guestbook)$/.test(comment.body.trim()))
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.id - b.id)
  const decision = decisions.at(-1)
  if (!decision || decision.body.trim() !== `/approve-guestbook ${parsed.hash}`) return null
  return { ...parsed.entry, id: issue.number, author: issue.user.login, date: decision.updated_at, url: `https://github.com/LilPolaris/LilPolaris-blog/issues/${issue.number}` }
}
