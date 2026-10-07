'use strict'

// Hexo reads the text after an asset_img slug as the image title, but the
// admin editor and existing posts write it as alt text. Re-register the tag
// so a lone caption becomes alt; a "title" "alt" pair keeps both.
const { htmlTag, url_for: urlFor, encodeURL } = require('hexo-util')

const isSize = value => /^\d+$/.test(value)

hexo.extend.tag.unregister('asset_img')
hexo.extend.tag.register('asset_img', function assetImg (args) {
  const PostAsset = hexo.model('PostAsset')
  const index = args.findIndex(arg => PostAsset.findOne({ post: this._id, slug: arg }))
  if (index === -1) return ''

  const asset = PostAsset.findOne({ post: this._id, slug: args[index] })
  const rest = args.slice(index + 1)
  const attrs = {
    src: urlFor.call(hexo, encodeURL(new URL(asset.path, hexo.config.url).pathname)),
    class: args.slice(0, index).join(' ')
  }
  if (rest.length && isSize(rest[0])) attrs.width = rest.shift()
  if (rest.length && isSize(rest[0])) attrs.height = rest.shift()
  if (rest.length === 1) attrs.alt = rest[0]
  else if (rest.length > 1) [attrs.title, attrs.alt] = [rest[0], rest.slice(1).join(' ')]

  return htmlTag('img', attrs)
})
