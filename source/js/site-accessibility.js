(() => {
  const palettes = [
    ['mint', '薄荷青', '#9fcfc3'],
    ['rose', '豆沙粉', '#d4a7ac'],
    ['blue', '雾霾蓝', '#a2bdcf'],
    ['lavender', '淡紫', '#bcb0cd'],
    ['amber', '暖杏', '#d7bc93']
  ]
  const paletteKey = 'polaris-palette'
  const validPalette = value => palettes.some(([name]) => name === value)
  let palette = 'mint'
  try {
    const saved = localStorage.getItem(paletteKey)
    if (validPalette(saved)) palette = saved
  } catch {
    // Storage can be unavailable; the selector still works for this visit.
  }
  document.documentElement.dataset.polarisPalette = palette
  let closePalette = () => {}

  const isVisible = element => Boolean(element && element.getClientRects().length)

  const initSidebar = () => {
    const wrapper = document.getElementById('toggle-menu')
    const toggle = wrapper?.querySelector('button')
    const sidebar = document.getElementById('sidebar-menus')
    const close = sidebar?.querySelector('.sidebar-close-button')
    const mask = document.getElementById('menu-mask')
    if (!toggle || !sidebar || toggle.dataset.a11yBound) return

    toggle.dataset.a11yBound = 'true'
    const syncState = () => {
      const open = sidebar.classList.contains('open')
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单')
      sidebar.setAttribute('aria-hidden', String(!open))
      sidebar.inert = !open
      if (open) window.setTimeout(() => close?.focus(), 80)
    }

    new MutationObserver(syncState).observe(sidebar, { attributes: true, attributeFilter: ['class'] })
    wrapper.addEventListener('click', () => window.setTimeout(syncState))
    close?.addEventListener('click', event => {
      event.preventDefault()
      mask?.click()
      window.setTimeout(() => toggle.focus(), 550)
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar.classList.contains('open')) {
        mask?.click()
        window.setTimeout(() => toggle.focus(), 550)
      }
    })
    syncState()
  }

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

  const initRightside = () => {
    const panel = document.getElementById('rightside-config-hide')
    const trigger = document.getElementById('rightside-config')
    if (!panel || !trigger) return

    if (!panel.querySelector('#polaris-palette-toggle')) {
      closePalette()
      document.getElementById('polaris-palette-panel')?.remove()
      const button = document.createElement('button')
      button.id = 'polaris-palette-toggle'
      button.type = 'button'
      button.title = '主题颜色'
      button.setAttribute('aria-label', '选择主题颜色')
      button.setAttribute('aria-controls', 'polaris-palette-panel')
      button.setAttribute('aria-expanded', 'false')
      const icon = document.createElement('i')
      icon.className = 'fas fa-palette'
      icon.setAttribute('aria-hidden', 'true')
      button.append(icon)
      const darkMode = panel.querySelector('#darkmode')
      if (darkMode) darkMode.after(button)
      else panel.append(button)

      const picker = document.createElement('div')
      picker.id = 'polaris-palette-panel'
      picker.hidden = true
      picker.setAttribute('role', 'group')
      picker.setAttribute('aria-label', '主题颜色')
      palettes.forEach(([name, label, color]) => {
        const option = document.createElement('button')
        option.type = 'button'
        option.textContent = label
        option.dataset.palette = name
        option.style.setProperty('--palette-swatch', color)
        option.setAttribute('aria-label', `使用${label}主题`)
        option.setAttribute('aria-pressed', String(name === palette))
        option.addEventListener('click', () => {
          palette = name
          document.documentElement.dataset.polarisPalette = name
          try {
            localStorage.setItem(paletteKey, name)
          } catch {
            // Keep the selected palette even when persistence is blocked.
          }
          picker.querySelectorAll('button').forEach(item => {
            item.setAttribute('aria-pressed', String(item.dataset.palette === name))
          })
          closePalette(true)
        })
        picker.append(option)
      })
      document.body.append(picker)
      closePalette = (restoreFocus = false) => {
        if (picker.hidden) return
        picker.hidden = true
        button.setAttribute('aria-expanded', 'false')
        if (restoreFocus && button.isConnected && !panel.inert) button.focus()
      }
      button.addEventListener('click', () => {
        const open = picker.hidden
        picker.hidden = !open
        button.setAttribute('aria-expanded', String(open))
        if (open) picker.querySelector('[aria-pressed="true"]').focus()
      })
    }
    if (trigger.dataset.a11yBound) return
    trigger.dataset.a11yBound = 'true'
    const syncState = () => {
      const open = panel.classList.contains('show')
      trigger.setAttribute('aria-expanded', String(open))
      panel.setAttribute('aria-hidden', String(!open))
      panel.inert = !open
      if (!open) closePalette()
    }
    new MutationObserver(syncState).observe(panel, {
      attributes: true,
      attributeFilter: ['class']
    })
    trigger.addEventListener('click', () => window.setTimeout(syncState))
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

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePalette(true)
  })
  document.addEventListener('click', event => {
    if (!event.target.closest('#polaris-palette-panel, #polaris-palette-toggle')) closePalette()
  })
  document.addEventListener('focusin', event => {
    if (!event.target.closest('#polaris-palette-panel, #polaris-palette-toggle')) closePalette()
  })

  const init = () => {
    closePalette()
    document.documentElement.dataset.polarisPalette = palette
    initSidebar()
    initSearch()
    initRightside()
    initShareLinks()
    initScrollableRegions()
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
  window.addEventListener('pjax:complete', init)
})()
