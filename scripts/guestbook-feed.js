'use strict'
const fs = require('node:fs')
const path = require('node:path')
hexo.extend.generator.register('guestbook-feed', () => {
  const cache = path.join(hexo.base_dir, '.guestbook-cache.json')
  const data = fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : '{"updated":null,"entries":[]}'
  JSON.parse(data)
  return { path: 'guestbook/entries.json', data }
})
