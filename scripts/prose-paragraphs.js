'use strict'

const { splitProseLines } = require('./lib/prose-paragraphs')

// Posts only: pages such as the guestbook are hand-written HTML.
hexo.extend.filter.register('before_post_render', data => {
  if (data.source && data.source.startsWith('_posts/') && typeof data.content === 'string') {
    data.content = splitProseLines(data.content)
  }
  return data
})
