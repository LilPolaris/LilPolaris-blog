(() => {
  // Theme choice lives in polaris-theme-picker.js; this file only patches
  // accessibility gaps in Butterfly's search dialog, share icons and
  // scrollable code/table regions.
  const isVisible = element => Boolean(element && element.getClientRects().length)

  const initSearch = () => {
    const trigger = document.querySelector('#search-button > .search')
    const dialog = document.getElementById('local-search-dialog')
    const close = dialog?.querySelector('.search-close-button')
    const input = dialog?.querySelector('input')
    const mask = document.getElementById('search-mask')
    if (!trigger || !dialog || trigger.dataset.a11yBound) return

    trigger.dataset.a11yBound = 'true'
    const setState = open => {
      trigger.setAttribute('aria-expanded', String(open))
      dialog.setAttribute('aria-hidden', String(!open))
      mask?.setAttribute('aria-hidden', String(!open))
    }
    const syncState = () => setState(isVisible(dialog))
    const returnFocus = () => window.setTimeout(() => {
      syncState()
      trigger.focus()
    }, 550)

    trigger.addEventListener('click', () => {
      setState(true)
      window.setTimeout(() => input?.focus(), 320)
    })
    close?.addEventListener('click', returnFocus)
    mask?.addEventListener('click', returnFocus)
    new MutationObserver(syncState).observe(dialog, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') returnFocus()
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(isVisible)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })
    syncState()
  }

  const initShareLinks = () => {
    const share = document.querySelector('.social-share')
    if (!share || share.dataset.a11yBound) return

    share.dataset.a11yBound = 'true'
    const labels = {
      'icon-facebook': '分享到 Facebook',
      'icon-x': '分享到 X',
      'icon-wechat': '分享到微信',
      'icon-weibo': '分享到微博',
      'icon-qq': '分享到 QQ'
    }
    const enhance = () => {
      share.querySelectorAll('a.social-share-icon').forEach(link => {
        const className = Object.keys(labels).find(name => link.classList.contains(name))
        if (className) link.setAttribute('aria-label', labels[className])
        if (link.target === '_blank') link.rel = 'noopener noreferrer'
      })
    }
    new MutationObserver(enhance).observe(share, { childList: true, subtree: true })
    enhance()
  }

  const initScrollableRegions = () => {
    document.querySelectorAll('#article-container figure.highlight table, #article-container .table-wrap').forEach(region => {
      if (region.hasAttribute('tabindex')) return
      region.tabIndex = 0
      region.setAttribute('aria-label', region.matches('table') ? '代码，可横向滚动' : '表格，可横向滚动')
    })
  }

  const init = () => {
    initSearch()
    initShareLinks()
    initScrollableRegions()
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
  window.addEventListener('pjax:complete', init)
})()
