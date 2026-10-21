(() => {
  // Shows one quote at a time and swaps it every 15 seconds with a slow fade.
  // Chinese quotes are written vertically; in the manuscript theme the title
  // and quote are laid out on grid paper instead.
  const INTERVAL = 15000
  const FADE = 1500 // keep in step with the opacity transition in polaris-home.css

  const init = () => {
    const hero = document.querySelector('.polaris-hero')
    const pool = JSON.parse(document.getElementById('polaris-quotes')?.textContent || '[]')
    if (!hero || !pool.length || !window.PolarisQuote) return

    const root = document.documentElement
    const quoteBox = hero.querySelector('.polaris-hero__quote')
    const grid = hero.querySelector('.polaris-hero__manuscript')
    const title = hero.querySelector('.polaris-hero__title').textContent
    let index = Math.floor(Math.random() * pool.length)

    const fillQuote = (box, quote) => {
      const columns = PolarisQuote.splitQuoteColumns(quote)
      box.replaceChildren(...(columns
        ? columns.map(text => Object.assign(document.createElement('span'), { textContent: text }))
        : [document.createTextNode(quote)]))
      box.classList.toggle('is-vertical', Boolean(columns))
      box.classList.toggle('is-horizontal', !columns)
    }

    // Reserve the height of the tallest quote so the list below never jumps.
    const reserveHeight = () => {
      const probe = quoteBox.cloneNode(false)
      probe.removeAttribute('style')
      probe.setAttribute('aria-hidden', 'true')
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' })
      quoteBox.after(probe)
      const tallest = Math.max(...pool.map(quote => {
        fillQuote(probe, quote)
        return probe.offsetHeight
      }))
      probe.remove()
      quoteBox.style.minHeight = `${tallest}px`
    }

    const renderGrid = quote => {
      if (root.dataset.polarisTheme !== 'manuscript') {
        grid.replaceChildren()
        hero.classList.remove('is-manuscript-ready')
        return
      }
      const columns = hero.clientWidth >= 560 ? 20 : 12
      const minQuoteRows = Math.max(...pool.map(item => PolarisQuote.quoteRowCount(item, columns)))
      grid.style.setProperty('--polaris-grid-columns', columns)
      grid.replaceChildren(...PolarisQuote.layoutManuscript({ title, quote, columns, minQuoteRows }).map(row => {
        const line = document.createElement('div')
        line.className = 'polaris-grid__row'
        line.append(...row.map(cell => Object.assign(document.createElement('span'), { textContent: cell })))
        return line
      }))
      grid.append(Object.assign(document.createElement('p'), {
        className: 'polaris-grid__note',
        textContent: `${columns}×${columns}＝${columns * columns}`
      }))
      hero.classList.add('is-manuscript-ready')
    }

    const render = () => {
      fillQuote(quoteBox, pool[index])
      renderGrid(pool[index])
    }
    const layout = () => {
      reserveHeight()
      render()
    }

    layout()
    document.fonts?.ready.then(layout)
    new MutationObserver(layout).observe(root, { attributes: true, attributeFilter: ['data-polaris-theme'] })
    let resizeTimer
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(layout, 150)
    })

    // Hold still while the reader hovers the quote, while the tab is hidden,
    // and for readers who asked for reduced motion.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let hovering = false
    for (const element of [quoteBox, grid]) {
      element.addEventListener('mouseenter', () => { hovering = true })
      element.addEventListener('mouseleave', () => { hovering = false })
    }
    setInterval(() => {
      if (document.hidden || hovering || reduceMotion.matches || pool.length < 2) return
      hero.classList.add('is-fading')
      setTimeout(() => {
        index = PolarisQuote.pickNextIndex(pool.length, index)
        render()
        hero.classList.remove('is-fading')
      }, FADE)
    }, INTERVAL)
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
})()
