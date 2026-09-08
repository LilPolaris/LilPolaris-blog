(() => {
  const progressKey = 'polaris-reading-progress-v1'
  const fontKey = 'polaris-reading-font'
  const sizes = [16, 18, 20]
  const maxAge = 90 * 24 * 60 * 60 * 1000
  let dispose = () => {}
  let fontSize = 16
  try {
    const stored = Number(localStorage.getItem(fontKey))
    if (sizes.includes(stored)) fontSize = stored
  } catch { /* Reading tools also work without storage permission. */ }

  const readProgress = () => {
    try {
      const data = JSON.parse(localStorage.getItem(progressKey) || '{}')
      if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
      return Object.fromEntries(Object.entries(data).filter(([path, value]) =>
        path.startsWith('/') && value && Number.isFinite(value.time) &&
        Date.now() - value.time >= 0 && Date.now() - value.time < maxAge &&
        Number.isFinite(value.ratio) && value.ratio > 0 && value.ratio < 1 &&
        Number.isInteger(value.index) && value.index >= 0 &&
        Number.isFinite(value.offset) && value.offset >= 0 && value.offset <= 1 &&
        typeof value.text === 'string'
      ))
    } catch { return {} }
  }

  const init = () => {
    dispose()
    const article = document.querySelector('#post #article-container')
    if (!article) return
    const path = location.pathname.replace(/\/index\.html$/, '/').replace(/\/?$/, '/')
    const controller = new AbortController()
    const on = (target, type, handler, options = {}) =>
      target.addEventListener(type, handler, { ...options, signal: controller.signal })
    const blocks = [...article.children].filter(element => element.textContent.trim() || element.querySelector('img'))
    const textOf = element => element.textContent.trim().slice(0, 100)
    const line = () => scrollY + 100
    const topOf = element => element.getBoundingClientRect().top + scrollY
    const isLong = () => article.textContent.trim().length >= 1000 || article.offsetHeight > innerHeight * 2
    const toolbar = document.createElement('div')
    toolbar.id = 'polaris-reading-tools'
    toolbar.setAttribute('role', 'group')
    toolbar.setAttribute('aria-label', '正文字号')
    const label = document.createElement('span')
    label.textContent = '正文字号'
    toolbar.append(label)
    article.before(toolbar)

    const applyFont = () => {
      article.style.setProperty('--polaris-reading-size', `${fontSize}px`)
      toolbar.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.size) === fontSize))
      })
    }
    sizes.forEach((size, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = ['标准', '较大', '大号'][index]
      button.dataset.size = size
      button.setAttribute('aria-label', `${button.textContent}字号，${size}像素`)
      on(button, 'click', () => {
        fontSize = size
        applyFont()
        try { localStorage.setItem(fontKey, String(size)) } catch { /* Optional persistence. */ }
      })
      toolbar.append(button)
    })
    applyFont()

    let timer
    let interacted = false
    let pending = false
    let notice
    const update = value => {
      const entries = readProgress()
      if (value) entries[path] = value
      else delete entries[path]
      const recent = Object.entries(entries).sort((a, b) => b[1].time - a[1].time).slice(0, 50)
      try { localStorage.setItem(progressKey, JSON.stringify(Object.fromEntries(recent))) } catch { /* Storage may be full or disabled. */ }
    }
    const capture = () => {
      if (!blocks.length || !article.offsetHeight) return null
      const ratio = (line() - topOf(article)) / article.offsetHeight
      if (ratio <= 0 || ratio >= 1) return null
      let index = blocks.findIndex(element => topOf(element) + element.offsetHeight > line())
      if (index < 0) index = blocks.length - 1
      const block = blocks[index]
      return {
        index, text: textOf(block), ratio,
        offset: Math.max(0, Math.min(1, (line() - topOf(block)) / Math.max(1, block.offsetHeight))),
        time: Date.now()
      }
    }
    const restore = (saved, focus = true) => {
      let block = blocks[saved.index]
      if (!block || textOf(block) !== saved.text) block = blocks.find(item => textOf(item) === saved.text)
      const target = block
        ? topOf(block) + block.offsetHeight * saved.offset
        : topOf(article) + article.offsetHeight * saved.ratio
      window.scrollTo({ top: Math.max(0, target - 100), behavior: 'instant' })
      if (focus && block) {
        if (!block.hasAttribute('tabindex')) {
          block.tabIndex = -1
          block.addEventListener('blur', () => block.removeAttribute('tabindex'), { once: true })
        }
        block.focus({ preventScroll: true })
      }
    }
    const save = () => {
      clearTimeout(timer)
      if (!interacted || pending || !article.isConnected || !isLong()) return
      if (scrollY + innerHeight >= topOf(article) + article.offsetHeight - 32) {
        update(null)
        return
      }
      const current = capture()
      if (current && current.ratio >= 0.03) update(current)
    }
    const closeNotice = () => {
      pending = false
      notice?.remove()
    }
    const saved = readProgress()[path]
    // An explicit heading link takes precedence over the saved reading position.
    if (saved && isLong() && !location.hash) {
      pending = true
      notice = document.createElement('aside')
      notice.id = 'polaris-reading-resume'
      notice.setAttribute('aria-label', '上次阅读进度')
      const message = document.createElement('p')
      message.textContent = `上次读到约 ${Math.round(saved.ratio * 100)}%`
      notice.append(message)
      const actions = [
        ['继续上次阅读', () => { closeNotice(); restore(saved); interacted = true; save() }],
        ['从头阅读', () => { closeNotice(); update(null); interacted = false; window.scrollTo({ top: 0, behavior: 'instant' }); toolbar.querySelector('button').focus({ preventScroll: true }) }],
        ['暂不恢复', () => { closeNotice(); toolbar.querySelector('button').focus({ preventScroll: true }) }]
      ]
      actions.forEach(([text, action]) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = text
        on(button, 'click', action)
        notice.append(button)
      })
      document.body.append(notice)
    }
    on(window, 'scroll', () => {
      interacted = true
      clearTimeout(timer)
      timer = setTimeout(save, 400)
    }, { passive: true })
    on(window, 'pagehide', save)
    on(document, 'visibilitychange', () => { if (document.hidden) save() })
    on(document, 'keydown', event => {
      if (event.key === 'Escape' && pending) {
        const hadFocus = notice.contains(document.activeElement)
        closeNotice()
        if (hadFocus) toolbar.querySelector('button').focus({ preventScroll: true })
      }
    })
    dispose = () => {
      save()
      clearTimeout(timer)
      controller.abort()
      toolbar.remove()
      notice?.remove()
      dispose = () => {}
    }
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
  window.addEventListener('pjax:send', () => dispose())
  window.addEventListener('pjax:complete', init)
})()
