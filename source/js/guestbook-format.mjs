export const REPO = 'LilPolaris/LilPolaris-blog'
export const COLORS = ['#263b45', '#327a72', '#c75b75', '#527cbd', '#9670b5', '#d59a36', '#ffffff']
export const WIDTHS = [3, 7, 14, 24]
export const MAX_POINTS = 1200
export const MAX_STROKES = 100

export function validateEntry(value) {
  if (!value || value.version !== 1 || !['drawing', 'message'].includes(value.kind)) throw Error('投稿格式不正确')
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 24) throw Error('昵称请填写 1–24 个字符')
  if (typeof value.message !== 'string' || value.message.length > 120) throw Error('留言最多 120 个字符')
  if (!Array.isArray(value.strokes) || value.strokes.length > MAX_STROKES) throw Error('画笔笔数超过限制')
  let points = 0
  for (const stroke of value.strokes) {
    if (!stroke || !COLORS.includes(stroke.color) || !WIDTHS.includes(stroke.width) || !Array.isArray(stroke.points) || !stroke.points.length) throw Error('画笔数据不正确')
    points += stroke.points.length
    if (points > MAX_POINTS) throw Error('画面太复杂了，请撤销几笔后再试')
    for (const point of stroke.points) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isInteger) || point[0] < 0 || point[0] > 960 || point[1] < 0 || point[1] > 600) throw Error('画笔位置不正确')
    }
  }
  if (value.kind === 'drawing' && !points) throw Error('先画一笔吧')
  if (value.kind === 'message' && (!value.message.trim() || points)) throw Error('请写一句留言')
  return { version: 1, kind: value.kind, name: value.name.trim(), message: value.message.trim(), strokes: value.strokes.map(s => ({color: s.color, width: s.width, points: s.points})) }
}

export function renderDrawing(canvas, strokes) {
  const ctx = canvas.getContext('2d')
  canvas.width = 960
  canvas.height = 600
  ctx.fillStyle = '#fffdf6'
  ctx.fillRect(0, 0, 960, 600)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width
    const [first, ...rest] = stroke.points
    if (!rest.length) {
      ctx.beginPath(); ctx.arc(first[0], first[1], stroke.width / 2, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath(); ctx.moveTo(...first)
      rest.forEach(point => ctx.lineTo(...point)); ctx.stroke()
    }
  }
}
