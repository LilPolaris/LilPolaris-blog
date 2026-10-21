(() => {
  // One share button at the end of an article; the icons unfold beside it.
  const init = () => {
    const toggle = document.getElementById('polaris-share-toggle')
    const icons = document.getElementById('polaris-share-icons')
    if (!toggle || !icons || toggle.dataset.bound) return
    toggle.dataset.bound = 'true'

    const setOpen = open => {
      icons.hidden = !open
      toggle.setAttribute('aria-expanded', String(open))
    }
    toggle.addEventListener('click', () => setOpen(icons.hidden))
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || icons.hidden) return
      const hadFocus = icons.contains(document.activeElement)
      setOpen(false)
      if (hadFocus) toggle.focus()
    })
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
  window.addEventListener('pjax:complete', init)
})()
