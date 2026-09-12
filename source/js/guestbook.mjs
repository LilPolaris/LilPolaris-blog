import { COLORS, WIDTHS, MAX_POINTS, MAX_STROKES, REPO, validateEntry, renderDrawing } from './guestbook-format.mjs'

const root = document.getElementById('guestbook')
if (root) {
  const $ = id => document.getElementById(id)
  const canvas = $('gb-canvas')
  const draftKey = 'polaris-guestbook-draft-v1'
  const status = message => { $('gb-status').textContent = message }
  let strokes = [], undo = [], kind = 'drawing', color = COLORS[0], width = 7, activePointer = null
  let submissionBody = '', approvalText = ''
  const snapshot = () => JSON.parse(JSON.stringify(strokes))
  const stashUndo = () => { undo.push(snapshot()); if (undo.length > 20) undo.shift() }
  const redraw = () => { renderDrawing(canvas, strokes); $('gb-undo').disabled = !undo.length }
  const entry = () => validateEntry({ version: 1, kind, name: $('gb-name').value, message: $('gb-message').value, strokes: kind === 'drawing' ? snapshot() : [] })
  const saveDraft = () => {
    try { localStorage.setItem(draftKey, JSON.stringify({strokes, kind, name: $('gb-name').value, message: $('gb-message').value})) } catch { /* Drawing remains usable without local storage. */ }
  }
  const setMode = mode => {
    kind = mode
    $('gb-drawing-area').hidden = mode !== 'drawing'
    $('gb-drawing-mode').setAttribute('aria-pressed', String(mode === 'drawing'))
    $('gb-message-mode').setAttribute('aria-pressed', String(mode === 'message'))
    $('gb-message').required = mode === 'message'
    saveDraft()
  }
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || 'null')
    if (draft) {
      const checked = validateEntry({ ...draft, version: 1, kind: draft.strokes?.length ? 'drawing' : 'message', name: draft.name || '草稿', message: draft.message || '草稿' })
      strokes = checked.strokes
      $('gb-name').value = typeof draft.name === 'string' ? draft.name.slice(0, 24) : ''
      $('gb-message').value = typeof draft.message === 'string' ? draft.message.slice(0, 120) : ''
      kind = draft.kind === 'message' ? 'message' : 'drawing'
    }
  } catch { /* Ignore a corrupt or incompatible draft. */ }
  const colorNames = ['墨黑', '薄荷绿', '豆沙红', '天空蓝', '淡紫', '暖黄', '白色']
  COLORS.forEach((value, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gb-swatch'
    button.style.setProperty('--swatch', value)
    button.setAttribute('aria-label', colorNames[index])
    button.setAttribute('aria-pressed', String(value === color))
    button.addEventListener('click', () => {
      color = value
      $('gb-colors').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
    })
    $('gb-colors').append(button)
  })
  $('gb-width').addEventListener('change', event => { const value = Number(event.target.value); if (WIDTHS.includes(value)) width = value })
  const pointAt = event => {
    const rect = canvas.getBoundingClientRect()
    return [Math.max(0, Math.min(960, Math.round((event.clientX - rect.left) * 960 / rect.width))), Math.max(0, Math.min(600, Math.round((event.clientY - rect.top) * 600 / rect.height)))]
  }
  const pointCount = () => strokes.reduce((total, stroke) => total + stroke.points.length, 0)
  canvas.addEventListener('pointerdown', event => {
    if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (strokes.length >= MAX_STROKES || pointCount() >= MAX_POINTS) { status('画面已经很丰富了，请撤销几笔后继续。'); return }
    event.preventDefault()
    stashUndo()
    activePointer = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    strokes.push({color, width, points: [pointAt(event)]})
    redraw()
  })
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return
    const point = pointAt(event)
    const last = strokes.at(-1).points.at(-1)
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 4) return
    if (pointCount() >= MAX_POINTS) { status('画面已达到保存上限，可以投稿或撤销几笔。'); return }
    strokes.at(-1).points.push(point)
    redraw()
  })
  const finishStroke = event => {
    if (event.pointerId !== activePointer) return
    activePointer = null
    saveDraft()
  }
  canvas.addEventListener('pointerup', finishStroke)
  canvas.addEventListener('pointercancel', finishStroke)
  canvas.addEventListener('lostpointercapture', finishStroke)
  $('gb-undo').addEventListener('click', () => { if (undo.length) strokes = undo.pop(); redraw(); saveDraft() })
  $('gb-clear').addEventListener('click', () => { if (strokes.length) stashUndo(); strokes = []; redraw(); saveDraft(); status('已清空画布，可以撤销。') })
  $('gb-download').addEventListener('click', () => {
    canvas.toBlob(blob => {
      if (!blob) { status('图片保存失败，请重试。'); return }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'LilPolaris-到此一游.png'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  })
  $('gb-drawing-mode').addEventListener('click', () => setMode('drawing'))
  $('gb-message-mode').addEventListener('click', () => setMode('message'))
  for (const id of ['gb-name', 'gb-message']) $(id).addEventListener('input', () => {
    $('gb-count').textContent = `${$('gb-message').value.length} / 120`
    saveDraft()
  })
  $('gb-count').textContent = `${$('gb-message').value.length} / 120`
  setMode(kind); redraw()

  const encode = async value => {
    let bytes = new TextEncoder().encode(JSON.stringify(value)), prefix = 'j.'
    if (typeof CompressionStream !== 'undefined') {
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
      prefix = 'g.'
    }
    return prefix + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  }
  const decode = async payload => {
    if (!/^[gj]\.[A-Za-z0-9_-]+$/.test(payload) || payload.length > 24000) throw Error('投稿预览链接不完整或太长')
    const raw = Uint8Array.from(atob(payload.slice(2).replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
    let bytes = raw
    if (payload.startsWith('g.')) {
      if (typeof DecompressionStream === 'undefined') throw Error('请使用较新的浏览器预览这张涂鸦')
      const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
      const chunks = []; let length = 0
      while (true) {
        const {done, value} = await reader.read()
        if (done) break
        length += value.length
        if (length > 65536) { await reader.cancel(); throw Error('投稿数据太大') }
        chunks.push(value)
      }
      bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    }
    if (bytes.length > 65536) throw Error('投稿数据太大')
    return validateEntry(JSON.parse(new TextDecoder().decode(bytes)))
  }
  const hash = async payload => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)))].map(b => b.toString(16).padStart(2, '0')).join('')
  const showPreview = value => {
    if ($('gb-preview').open) $('gb-preview').close()
    $('gb-preview-name').textContent = value.name
    $('gb-preview-message').textContent = value.message
    $('gb-preview-canvas').hidden = value.kind !== 'drawing'
    if (value.kind === 'drawing') renderDrawing($('gb-preview-canvas'), value.strokes)
    $('gb-copy-fallback').hidden = true
    $('gb-review').hidden = true
    $('gb-copy').hidden = true
    $('gb-github').hidden = false
    $('gb-preview').showModal()
  }
  $('gb-close-preview').addEventListener('click', () => $('gb-preview').close())
  $('gb-preview').addEventListener('click', event => {
    if (event.target !== $('gb-preview')) return
    const rect = $('gb-preview').getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('gb-preview').close()
  })
  $('gb-form').addEventListener('submit', async event => {
    event.preventDefault()
    $('gb-submit').disabled = true
    try {
      const value = entry(), payload = await encode(value)
      if (payload.length > 24000) throw Error('画面过于复杂，请先保存图片，再撤销几笔后投稿')
      const reviewUrl = `https://lilpolaris.github.io/guestbook/#review=${payload}`
      submissionBody = `这是一份留言墙投稿，请博主预览后审核。\n\n[查看完整投稿预览](${reviewUrl})\n\n<!-- polaris-guestbook:v1\n${payload}\n-->`
      const params = new URLSearchParams({template: 'guestbook.md', title: `[留言墙] ${value.kind === 'drawing' ? '涂鸦' : '留言'} · ${value.name}`, labels: 'guestbook', body: submissionBody})
      const fullUrl = `https://github.com/${REPO}/issues/new?${params}`
      showPreview(value)
      $('gb-preview-title').textContent = '准备留下这份投稿？'
      $('gb-github').textContent = '去 GitHub 提交'
      if (fullUrl.length <= 7000) {
        $('gb-github').href = fullUrl
        $('gb-preview-hint').textContent = '下一步会打开 GitHub。登录后点击提交，博主审核通过才会上墙。'
      } else {
        params.delete('body')
        $('gb-github').href = `https://github.com/${REPO}/issues/new?${params}`
        $('gb-copy').hidden = false
        $('gb-preview-hint').textContent = '这张画比较丰富：先复制投稿内容，再去 GitHub，用复制的内容替换正文后提交。'
      }
      status('投稿预览已准备好；还需要在 GitHub 确认提交。')
    } catch (error) { status(error.message || '准备投稿失败，请重试。') }
    finally { $('gb-submit').disabled = false }
  })
  const copy = async (text, hint) => {
    try { await navigator.clipboard.writeText(text); $('gb-preview-hint').textContent = hint }
    catch {
      $('gb-copy-fallback').value = text; $('gb-copy-fallback').hidden = false
      $('gb-copy-fallback').focus(); $('gb-copy-fallback').select()
      $('gb-preview-hint').textContent = '浏览器没有允许自动复制，请复制下面已选中的完整内容。'
    }
  }
  $('gb-copy').addEventListener('click', () => copy(submissionBody, '已复制。去 GitHub，把正文替换成复制的内容后提交。'))
  $('gb-copy-approval').addEventListener('click', () => copy(approvalText, '已复制审核指令，回到对应 GitHub 投稿的评论框粘贴并发送即可。'))
  const openReview = async () => {
    if (!location.hash.startsWith('#review=')) return
    try {
      const payload = location.hash.slice(8), value = await decode(payload)
      approvalText = `/approve-guestbook ${await hash(payload)}`
      showPreview(value)
      $('gb-preview-title').textContent = '投稿预览 · 尚不代表已上墙'
      $('gb-preview-hint').textContent = '这是链接中携带的投稿预览，只有审核通过的作品才会进入公共画廊。'
      $('gb-github').hidden = true
      $('gb-review').hidden = false
      $('gb-approval').textContent = approvalText
    } catch (error) { status(`无法预览：${error.message}`) }
  }
  window.addEventListener('hashchange', openReview)
  openReview()

  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let paused = motion.matches
  const setPaused = value => {
    paused = value
    $('gb-wall').classList.toggle('gb-paused', paused)
    $('gb-pause').textContent = paused ? '播放弹幕' : '暂停弹幕'
    $('gb-pause').setAttribute('aria-pressed', String(paused))
  }
  $('gb-pause').addEventListener('click', () => setPaused(!paused))
  motion.addEventListener('change', event => { if (event.matches) setPaused(true) })
  setPaused(paused)
  const wallSection = root.querySelector('.gb-wall-section')
  $('gb-fullscreen').addEventListener('click', async () => {
    if (!wallSection.requestFullscreen) { status('这个浏览器不支持全屏，可以直接在这里看弹幕。'); return }
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await wallSection.requestFullscreen() }
    catch { status('浏览器未允许全屏，请直接在页面上查看。') }
  })
  document.addEventListener('fullscreenchange', () => { $('gb-fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏看墙' })
  const wall = $('gb-wall')
  new ResizeObserver(() => wall.style.setProperty('--gb-travel', `${wall.clientWidth}px`)).observe(wall)
  let wallEntries = []
  const detail = value => {
    showPreview(value)
    $('gb-preview-title').textContent = '路过的人留下了这些'
    $('gb-preview-hint').textContent = `GitHub @${value.author} · ${new Date(value.date).toLocaleDateString('zh-CN')}`
    $('gb-github').href = value.url
    $('gb-github').textContent = '查看原留言 / 回复'
  }
  function populate(entries) {
    $('gb-total').textContent = `${entries.filter(e => e.kind === 'drawing').length} 张作品`
    wallEntries = entries.filter(e => e.message)
    if (wallEntries.length) {
      wall.replaceChildren()
      $('gb-messages').replaceChildren()
      let next = 0
      for (let lane = 0; lane < Math.min(5, wallEntries.length); lane++) {
        const track = document.createElement('div'); track.className = 'gb-lane'
        const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'gb-chip'
        let current
        const advance = () => {
          current = wallEntries[next++ % wallEntries.length]
          chip.textContent = `${current.name}：${current.message}`
          chip.style.animationDuration = `${18 + Math.min(12, current.message.length / 5)}s`
        }
        advance(); chip.style.animationDelay = `${-lane * 3}s`
        chip.addEventListener('animationiteration', advance)
        chip.addEventListener('click', () => detail(current))
        track.append(chip); wall.append(track)
      }
      for (const value of wallEntries) {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'gb-message-item'
        item.textContent = `${value.name}：${value.message}`
        item.addEventListener('click', () => detail(value)); $('gb-messages').append(item)
      }
    }
    const drawings = entries.filter(e => e.kind === 'drawing')
    if (drawings.length) {
      $('gb-gallery').replaceChildren()
      for (const value of drawings) {
        const card = document.createElement('button'); card.type = 'button'; card.className = 'gb-card'
        const drawing = document.createElement('canvas'); drawing.setAttribute('aria-label', `${value.name} 的涂鸦`)
        const caption = document.createElement('span'); caption.textContent = value.name
        const words = document.createElement('span'); words.className = 'gb-card-message'; words.textContent = value.message || '留下了一张画'
        renderDrawing(drawing, value.strokes)
        card.append(drawing, caption, words); card.addEventListener('click', () => detail(value)); $('gb-gallery').append(card)
      }
    }
  }
  fetch('/guestbook/entries.json', { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw Error('作品暂时加载失败')
    const data = await response.json()
    if (!Array.isArray(data.entries)) throw Error('作品数据不正确')
    const entries = data.entries.map(raw => {
      const value = validateEntry(raw)
      if (!Number.isInteger(raw.id) || raw.id <= 0 || !Number.isFinite(Date.parse(raw.date)) || typeof raw.author !== 'string') throw Error('作品信息不完整')
      return { ...value, id: raw.id, author: raw.author, date: raw.date, url: `https://github.com/${REPO}/issues/${raw.id}` }
    })
    populate(entries)
  }).catch(() => {
    wall.querySelector('.gb-wall-empty')?.replaceChildren(document.createTextNode('留言暂时没能加载，请稍后刷新。'))
    status('已审核作品暂时加载失败，你仍可以画画和准备投稿。')
  })
}
