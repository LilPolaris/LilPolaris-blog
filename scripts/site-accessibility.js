'use strict'

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const addAttribute = (tag, name, value) => {
  if (new RegExp(`\\s${name}=`).test(tag)) return tag
  return tag.replace(/>$/, ` ${name}="${escapeHtml(value)}">`)
}

hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('<body')) return html

  html = html.replace(
    /<div id="search-button">\s*<span class="site-page social-icon search">([\s\S]*?)<\/span>\s*<\/div>(?=<div class="menus_items">)/,
    '<div id="search-button"><button type="button" class="site-page social-icon search" aria-label="搜索" aria-haspopup="dialog" aria-expanded="false">$1</button></div>'
  )

  html = html.replace(
    /<div id="toggle-menu">\s*<span class="site-page">([\s\S]*?)<\/span>\s*<\/div>/,
    '<div id="toggle-menu"><button type="button" class="site-page menu-toggle-button" aria-label="打开导航菜单" aria-controls="sidebar-menus" aria-expanded="false">$1</button></div>'
  )

  html = html.replace(
    '<div id="sidebar-menus">',
    '<div id="sidebar-menus" aria-hidden="true" inert><button type="button" class="sidebar-close-button" aria-label="关闭导航菜单"><i class="fas fa-times" aria-hidden="true"></i></button>'
  )

  html = html.replace(
    /<div id="scroll-down">([\s\S]*?)<\/div>/,
    '<button id="scroll-down" type="button" aria-label="查看最新文章">$1</button>'
  )

  html = html.replace(
    '<div class="search-dialog">',
    '<div class="search-dialog" id="local-search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title" aria-hidden="true" tabindex="-1">'
  )
  html = html.replace(
    '<span class="search-dialog-title">',
    '<span class="search-dialog-title" id="search-dialog-title">'
  )
  html = html.replace(
    '<button class="search-close-button">',
    '<button class="search-close-button" type="button" aria-label="关闭搜索">'
  )
  html = html.replace(
    /<input placeholder="搜索文章" type="text"\s*\/>/,
    '<input id="local-search-input" placeholder="搜索文章" type="search" aria-label="搜索文章" autocomplete="off"/>'
  )
  html = html.replace(
    '<div id="search-mask">',
    '<div id="search-mask" aria-hidden="true">'
  )

  html = html.replace(
    '<div id="rightside-config-hide">',
    '<div id="rightside-config-hide" aria-hidden="true" inert>'
  )
  html = html.replace(
    /<button id="rightside-config"([^>]*)>/,
    '<button id="rightside-config"$1 aria-controls="rightside-config-hide" aria-expanded="false">'
  )

  html = html.replace(/<a class="extend (prev|next)"([^>]*)>/g, (match, direction, rest) => {
    const label = direction === 'prev' ? '上一页' : '下一页'
    return `<a class="extend ${direction}"${rest} aria-label="${label}">`
  })

  html = html.replace(/<button\b([^>]*\btitle="([^"]+)"[^>]*)>/g, (match, attrs, title) => {
    return /\baria-label=/.test(attrs)
      ? match
      : `<button${attrs} aria-label="${escapeHtml(title)}">`
  })

  html = html.replace(/<a\b([^>]*\btarget="_blank"[^>]*)>/g, (match, attrs) => {
    let tag = `<a${attrs}>`
    tag = addAttribute(tag, 'rel', 'noopener noreferrer')
    const title = attrs.match(/\btitle="([^"]+)"/)
    if (title) tag = addAttribute(tag, 'aria-label', title[1])
    return tag
  })

  if (html.includes('tag-cloud-list')) {
    const counts = new Map()
    hexo.locals.get('tags').forEach(tag => counts.set(String(tag.name), tag.length))

    html = html.replace(/(<div class="tag-cloud-list[^"]*">)([\s\S]*?)(<\/div>)/g, (match, open, links, close) => {
      const enhancedLinks = links.replace(/<a\b([^>]*)>([^<]+)<\/a>/g, (anchor, attrs, rawName) => {
        if (attrs.includes('tag-count')) return anchor
        const name = rawName.trim()
        const count = counts.get(name)
        if (count === undefined) return anchor
        const labelledAttrs = /\baria-label=/.test(attrs)
          ? attrs
          : `${attrs} aria-label="${escapeHtml(name)}，${count} 篇文章"`
        return `<a${labelledAttrs}>${rawName}<span class="tag-count" aria-hidden="true">${count}</span></a>`
      })
      return `${open}${enhancedLinks}${close}`
    })
  }

  return html
}, 20)

