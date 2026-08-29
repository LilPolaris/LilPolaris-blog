'use strict'

hexo.extend.helper.register('full_date', function fullDate(value, format) {
  const dateFormat = this.config.date_format
  const hasTime = /[Hhms]/.test(dateFormat)
  const fullFormat = format || (hasTime
    ? dateFormat
    : `${dateFormat} ${this.config.time_format}`.trim())
  return this.date(value, fullFormat)
})
