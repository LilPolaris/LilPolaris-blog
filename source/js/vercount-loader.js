// Load the Vercount client after the page is interactive. Butterfly's local
// search also initializes on `load`, so fetching the remote client beforehand
// can otherwise delay the search button on slow or blocked networks.
(() => {
  const loadVercount = () => {
    if (document.querySelector('script[data-polaris-vercount]')) return

    const script = document.createElement('script')
    script.src = 'https://events.vercount.one/js'
    script.async = true
    script.dataset.polarisVercount = ''
    document.head.appendChild(script)
  }

  const scheduleVercount = () => window.setTimeout(loadVercount, 0)

  if (document.readyState === 'complete') scheduleVercount()
  else window.addEventListener('load', scheduleVercount, { once: true })
})()
