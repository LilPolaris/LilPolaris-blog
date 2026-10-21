(() => {
  // Butterfly only fills its own runtime counter outside post pages, so the
  // footer counts the days itself.
  const fillRuntime = () => {
    const target = document.getElementById('polaris-runtime')
    const since = Date.parse(target?.dataset.since || '')
    if (!target || Number.isNaN(since)) return
    target.textContent = `${Math.max(0, Math.floor((Date.now() - since) / 86400000))} 天`
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fillRuntime, { once: true })
    : fillRuntime()
  window.addEventListener('pjax:complete', fillRuntime)
})()
