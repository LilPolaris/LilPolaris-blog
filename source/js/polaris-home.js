(() => {
  // Picks a quote at random, writes it vertically when it is Chinese, and in
  // the manuscript theme lays title and quote out on grid paper.
  const init = () => {
    const hero = document.querySelector('.polaris-hero')
    const pool = JSON.parse(document.getElementById('polaris-quotes')?.textContent || '[]')
    if (!hero || !pool.length || !window.PolarisQuote) return

    const quote = pool[Math.floor(Math.random() * pool.length)]
    const quoteBox = hero.querySelector('.polaris-hero__quote')
    const columns = PolarisQuote.splitQuoteColumns(quote)
    quoteBox.replaceChildren(...(columns
      ? columns.map(text => Object.assign(document.createElement('span'), { textContent: text }))
      : [document.createTextNode(quote)]))
    quoteBox.classList.toggle('is-vertical', Boolean(columns))
    quoteBox.classList.toggle('is-horizontal', !columns)

    const grid = hero.querySelector('.polaris-hero__manuscript')
    const title = hero.querySelector('.polaris-hero__title').textContent
    const renderGrid = () => {
      if (document.documentElement.dataset.polarisTheme !== 'manuscript') {
        grid.replaceChildren()
        hero.classList.remove('is-manuscript-ready')
        return
      }
      const count = hero.clientWidth >= 560 ? 20 : 12
      grid.style.setProperty('--polaris-grid-columns', count)
      grid.replaceChildren(...PolarisQuote.layoutManuscript({ title, quote, columns: count }).map(row => {
        const line = document.createElement('div')
        line.className = 'polaris-grid__row'
        line.append(...row.map(cell => Object.assign(document.createElement('span'), { textContent: cell })))
        return line
      }))
      grid.append(Object.assign(document.createElement('p'), {
        className: 'polaris-grid__note',
        textContent: `${count}×${count}＝${count * count}`
      }))
      hero.classList.add('is-manuscript-ready')
    }

    renderGrid()
    new MutationObserver(renderGrid).observe(document.documentElement, { attributes: true, attributeFilter: ['data-polaris-theme'] })
    let timer
    window.addEventListener('resize', () => {
      clearTimeout(timer)
      timer = setTimeout(renderGrid, 150)
    })
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init()
})()
