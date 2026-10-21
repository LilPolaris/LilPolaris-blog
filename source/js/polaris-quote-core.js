// Shared by the browser (window.PolarisQuote) and the Hexo build, which
// renders the default quote so readers without JavaScript still see one.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.PolarisQuote = factory()
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  var BREAKS = /[，、；：,;:。]/
  // Punctuation that must not open a row on manuscript paper (避头点).
  var CLOSING = '，。、；：？！”’）》」』…,.;:?!)'

  // Columns for vertical writing, or null when the quote should stay
  // horizontal because it has no Chinese.
  function splitQuoteColumns (quote) {
    if (!/[一-鿿]/.test(quote)) return null
    return quote.trim().replace(/。$/, '').split(BREAKS)
      .map(function (part) { return part.trim() })
      .filter(Boolean)
  }

  function toCells (text) {
    return Array.from(text).map(function (char) { return char === ' ' ? '' : char })
  }

  function wrap (cells, columns) {
    var rows = []
    var row = []
    cells.forEach(function (cell) {
      if (row.length === columns) {
        if (cell && CLOSING.indexOf(cell) !== -1) {
          row[columns - 1] += cell
          return
        }
        rows.push(row)
        row = []
      }
      row.push(cell)
    })
    if (row.length) {
      while (row.length < columns) row.push('')
      rows.push(row)
    }
    return rows
  }

  function quoteRows (quote, columns) {
    return wrap(['', ''].concat(toCells(quote)), columns)
  }

  function quoteRowCount (quote, columns) {
    return quoteRows(quote, columns).length
  }

  // Rows of `columns` cells: the title one character per cell, a blank row,
  // then the quote indented two cells, padded with blank rows up to
  // `minQuoteRows` so rotating quotes keep the grid the same height.
  function layoutManuscript (options) {
    var blank = function () { return new Array(options.columns).fill('') }
    var body = quoteRows(options.quote, options.columns)
    while (body.length < (options.minQuoteRows || 0)) body.push(blank())
    return wrap(toCells(options.title), options.columns).concat([blank()], body)
  }

  // A random index other than `current`, so the same quote never shows twice in a row.
  function pickNextIndex (length, current, random) {
    if (length < 2) return 0
    var next = Math.floor((random || Math.random)() * (length - 1))
    return next >= current ? next + 1 : next
  }

  return {
    splitQuoteColumns: splitQuoteColumns,
    layoutManuscript: layoutManuscript,
    quoteRowCount: quoteRowCount,
    pickNextIndex: pickNextIndex
  }
}))
