// Structural checks on the generated site. Run `npm run test:site`, which
// regenerates public/ first; these tests only read the output.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const yaml = createRequire(import.meta.url)('js-yaml')

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

export const readPage = relPath => readFileSync(publicDir + relPath, 'utf8')

export const articleOf = html => {
  const match = html.match(/<article[^>]*id="article-container"[^>]*>([\s\S]*?)<\/article>/)
  assert.ok(match, 'page has #article-container')
  return match[1]
}

test('theme override views are applied', () => {
  assert.match(readPage('index.html'), /data-polaris-override="header"/)
})

export const headOf = html => html.split('</head>')[0]

const fontStyles = ['fonts/noto-serif-sc/400.css', 'fonts/noto-serif-sc/500.css', 'fonts/long-cang/400.css', 'fonts/ma-shan-zheng/400.css']

test('theme boot script, token css and font css load in the head', () => {
  const head = headOf(readPage('index.html'))
  assert.match(head, /<script>[^<]*dataset\.polarisTheme/)
  assert.match(head, /href="\/css\/polaris-tokens\.css"/)
  for (const style of fontStyles) assert.ok(head.includes(`href="/${style}"`), style)
  assert.match(readPage('css/polaris-tokens.css'), /html\[data-polaris-theme="fog"\]\[data-theme="light"\]/)
})

test('every font file referenced by the font css is published', () => {
  for (const style of fontStyles) {
    const css = readPage(style)
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1].replace(/['"]/g, ''))
    assert.ok(urls.length > 0, `${style} references fonts`)
    for (const url of urls) {
      assert.ok(existsSync(publicDir + style.replace(/[^/]+$/, '') + url), `${style} -> ${url}`)
    }
  }
})

export const footerOf = html => {
  const match = html.match(/<footer id="footer"[^>]*>([\s\S]*?)<\/footer>/)
  assert.ok(match, 'page has footer#footer')
  return match[1]
}

test('home page drops the butterfly shell', () => {
  const html = readPage('index.html')
  assert.match(html, /<a class="polaris-home-link" href="\/" hidden/)
  for (const gone of ['class="menus_items"', 'id="aside-content"', 'fa-rss', 'id="rightside-config"']) {
    assert.ok(!html.includes(gone), `index.html still has ${gone}`)
  }
  assert.match(html, /<div id="search-button"><button(?=[^>]*type="button")(?=[^>]*class="site-page social-icon search")[^>]*>/)
})

test('nav keeps the #blog-info > a hook Butterfly main.js measures on load', () => {
  for (const page of ['index.html', 'posts/why-i-blog/index.html']) {
    assert.match(readPage(page), /<span id="blog-info"><a /, page)
  }
})

test('footer carries page links and site stats', () => {
  const footer = footerOf(readPage('index.html'))
  for (const href of ['/archives/', '/guestbook/', '/about/']) assert.ok(footer.includes(`href="${href}"`), href)
  for (const id of ['busuanzi_value_site_uv', 'busuanzi_value_site_pv', 'polaris-runtime']) assert.ok(footer.includes(`id="${id}"`), id)
  assert.match(footer, /\d+ 篇文章/)
  assert.match(footer, /\d+ 月 \d+ 日更新/)
})

test('post pages get a home link and the reading controls', () => {
  const html = readPage('posts/why-i-blog/index.html')
  assert.match(html, /class="polaris-home-link"/)
  for (const id of ['polaris-font-size', 'polaris-theme-toggle', 'readmode', 'darkmode', 'go-up']) {
    assert.ok(html.includes(`id="${id}"`), id)
  }
})

const quotePool = () => yaml.load(readFileSync(new URL('../_config.butterfly.yml', import.meta.url), 'utf8')).subtitle.sub
const postCount = () => readdirSync(new URL('../source/_posts/', import.meta.url)).filter(name => name.endsWith('.md')).length

test('home hero carries the whole quote pool and a server-rendered quote', () => {
  const html = readPage('index.html')
  assert.match(html, /<section class="polaris-hero/)
  const json = html.match(/<script id="polaris-quotes" type="application\/json">([\s\S]*?)<\/script>/)
  assert.ok(json, 'quote pool script')
  assert.equal(JSON.parse(json[1]).length, quotePool().length)
  const quote = html.match(/<div class="polaris-hero__quote[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  assert.ok(quote && quote[1].replace(/<[^>]+>/g, '').trim(), 'quote visible without JavaScript')
})

test('home lists every post as a table of contents row', () => {
  const html = readPage('index.html')
  const rows = html.match(/<li class="polaris-toc__row[^"]*"/g) || []
  assert.equal(rows.length, postCount())
  assert.match(html.match(/<li class="polaris-toc__row[^"]*">([\s\S]*?)<\/li>/)[1], /置顶/)
  assert.ok(!html.includes('recent-post-item'))
})

const metaOf = html => {
  const start = html.indexOf('id="post-meta"')
  assert.ok(start !== -1, 'page has #post-meta')
  return html.slice(start, html.indexOf('id="article-container"', start))
}
const sectionOf = (html, className) => {
  const match = html.match(new RegExp(`<nav class="${className}"[^>]*>([\\s\\S]*?)</nav>`))
  assert.ok(match, `page has nav.${className}`)
  return match[1]
}

test('essay pages drop butterfly extras and keep a quiet meta line', () => {
  const html = readPage('posts/why-i-blog/index.html')
  for (const gone of ['class="post-copyright"', 'relatedPosts', 'post-reward', 'id="post-outdate-notice"']) {
    assert.ok(!html.includes(gone), `still has ${gone}`)
  }
  const meta = metaOf(html)
  for (const text of ['2026 年 9 月 2 日', ' 字', '分钟', '次浏览']) assert.ok(meta.includes(text), text)
  assert.ok(!meta.includes('更新于'), 'essays hide the update date')
})

test('essay pages end with folded share, licence line and prev/next', () => {
  const html = readPage('posts/why-i-blog/index.html')
  assert.match(html, /<button[^>]*id="polaris-share-toggle"[^>]*aria-expanded="false"/)
  assert.match(html, /<div[^>]*id="polaris-share-icons"[^>]*hidden/)
  assert.match(html, /本文采用 <a[^>]*>CC BY-NC-SA 4\.0<\/a> 许可/)
  assert.equal((sectionOf(html, 'polaris-post-nav').match(/<a /g) || []).length, 2)
})

test('previous means the older post and next the newer one', () => {
  const nav = sectionOf(readPage('posts/why-i-blog/index.html'), 'polaris-post-nav')
  assert.match(nav, /class="polaris-post-nav__prev" href="\/posts\/freshman-year-1-sem-2\/"/)
  assert.match(nav, /class="polaris-post-nav__next" href="\/posts\/zhihu-01-2026-09-03\/"/)
})

test('tutorials show the update date and the outdated notice', () => {
  const html = readPage('posts/astrbot-chat-qq-setup-guide/index.html')
  assert.ok(html.includes('id="post-outdate-notice"'))
  assert.ok(metaOf(html).includes('更新于'))
})

test('series posts list their siblings and posts with headings get a contents card', () => {
  assert.match(sectionOf(readPage('posts/Student-Digital-Survival-Guide-1/index.html'), 'polaris-series'), /href="\/posts\/Student-Digital-Survival-Guide-0\/"/)
  assert.ok(readPage('posts/how-to-make-a-book/index.html').includes('id="card-toc"'))
})

const htmlPages = (dir = '') => readdirSync(publicDir + dir, { withFileTypes: true }).flatMap(entry => {
  const rel = dir + entry.name
  if (entry.isDirectory()) return rel === 'fonts' ? [] : htmlPages(`${rel}/`)
  return entry.name.endsWith('.html') ? [rel] : []
})

test('no page still loads the retired stylesheet or palette attribute', () => {
  for (const page of htmlPages()) {
    const html = readPage(page)
    assert.ok(!html.includes('site-polish.css'), page)
    assert.ok(!html.includes('data-polaris-palette'), page)
  }
})

test('guestbook styles only use variables that still exist', () => {
  assert.ok(readPage('guestbook/index.html').includes('/css/guestbook.css'))
  const css = readPage('css/guestbook.css')
  assert.deepEqual(css.match(/var\(--polaris-[a-z-]+/g) || [], [])
})

test('one-line essay paragraphs render as separate paragraphs', () => {
  const paragraphs = articleOf(readPage('posts/why-i-blog/index.html')).match(/<p[\s>]/g) || []
  assert.ok(paragraphs.length >= 5, `expected at least 5 <p>, got ${paragraphs.length}`)
})
