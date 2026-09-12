import { writeFile } from 'node:fs/promises'
import { approvedEntry } from './guestbook-lib.mjs'
import { REPO } from '../source/js/guestbook-format.mjs'

const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
async function list(path) {
  const rows = []
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`https://api.github.com/repos/${REPO}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error(`Guestbook API failed: ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data)) throw Error('Unexpected GitHub response')
    rows.push(...data)
    if (data.length < 100) return rows
  }
  throw Error('Guestbook pagination limit reached; refusing to publish partial moderation data')
}
const issues = await list('issues?state=open&labels=guestbook')
const entries = []
for (const issue of issues) {
  if (issue.pull_request || !issue.body?.includes('<!-- polaris-guestbook:v1')) continue
  const entry = approvedEntry(issue, await list(`issues/${issue.number}/comments`))
  if (entry) entries.push(entry)
}
entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
await writeFile('.guestbook-cache.json', JSON.stringify({ updated: new Date().toISOString(), entries }))
console.log(`Guestbook: exported ${entries.length} reviewed entries`)
