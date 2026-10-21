'use strict'

const { tocRows, starField } = require('./lib/polaris-home')
const { splitQuoteColumns } = require('../source/js/polaris-quote-core')

const toArray = items => (typeof items.toArray === 'function' ? items.toArray() : items)

hexo.extend.helper.register('polaris_toc_rows', function (posts, options = {}) {
  return tocRows(toArray(posts).map(post => ({
    title: post.title,
    path: post.path,
    sticky: post.sticky,
    // post.date is a moment in the site timezone, so CI's UTC clock cannot shift the day.
    date: post.date.format('MM.DD'),
    year: post.date.year(),
    categories: toArray(post.categories).map(({ name, path, parent }) => ({ name, path, parent }))
  })), { markNewest: Boolean(options.markNewest) })
})

// Tutorials go stale and get an update date and outdated notice; essays do not.
const TUTORIAL_CATEGORY = '教程'
hexo.extend.helper.register('polaris_is_tutorial', page =>
  toArray(page.categories || []).some(category => !category.parent && category.name === TUTORIAL_CATEGORY))

hexo.extend.helper.register('polaris_stars', () => starField({ count: 20, seed: 'polaris', width: 680, height: 300 }))

hexo.extend.helper.register('polaris_quote_columns', text => splitQuoteColumns(text))
