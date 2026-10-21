(() => {
  // The boot script in <head> has already applied the stored theme and left
  // the theme list on window.POLARIS_THEMES; this file only drives the picker.
  const themes = window.POLARIS_THEMES || []
  const storageKey = window.POLARIS_THEME_KEY || 'polaris-theme'
  const root = document.documentElement
  let close = () => {}

  const choose = id => {
    root.dataset.polarisTheme = id
    try {
      localStorage.setItem(storageKey, id)
    } catch {
      // Keep the choice for this visit even when storage is blocked.
    }
  }

  const swatch = color => {
    const dot = document.createElement('span')
    dot.className = 'polaris-theme-option__swatch'
    dot.style.background = color
    dot.setAttribute('aria-hidden', 'true')
    return dot
  }

  const init = () => {
    const button = document.getElementById('polaris-theme-toggle')
    if (!button || button.dataset.bound || !themes.length) return
    button.dataset.bound = 'true'
    document.getElementById('polaris-theme-panel')?.remove()

    const panel = document.createElement('div')
    panel.id = 'polaris-theme-panel'
    panel.className = 'polaris-popover'
    panel.hidden = true
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', '换主题')
    themes.forEach(theme => {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'polaris-theme-option'
      option.dataset.theme = theme.id
      option.setAttribute('aria-pressed', String(theme.id === root.dataset.polarisTheme))
      const name = document.createElement('span')
      name.textContent = theme.name
      option.append(name, swatch(theme.light.bg), swatch(theme.dark.bg))
      option.addEventListener('click', () => {
        choose(theme.id)
        panel.querySelectorAll('button').forEach(item => {
          item.setAttribute('aria-pressed', String(item.dataset.theme === theme.id))
        })
        close(true)
      })
      panel.append(option)
    })
    document.body.append(panel)

    close = (restoreFocus = false) => {
      if (panel.hidden) return
      panel.hidden = true
      button.setAttribute('aria-expanded', 'false')
      if (restoreFocus) button.focus()
    }
    button.addEventListener('click', () => {
      const open = panel.hidden
      panel.hidden = !open
      button.setAttribute('aria-expanded', String(open))
      if (open) panel.querySelector('[aria-pressed="true"]')?.focus()
    })
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close(true)
  })
  document.addEventListener('click', event => {
    if (!event.target.closest('#polaris-theme-panel, #polaris-theme-toggle')) close()
  })
  document.addEventListener('focusin', event => {
    if (!event.target.closest('#polaris-theme-panel, #polaris-theme-toggle')) close()
  })

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
  window.addEventListener('pjax:complete', init)
})()
