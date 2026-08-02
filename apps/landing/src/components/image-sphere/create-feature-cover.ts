import { createElement, type ComponentType, type SVGProps } from 'react'
import { createRoot } from 'react-dom/client'

export type CoverIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; absoluteStrokeWidth?: boolean }>

const COVER_W = 720
const COVER_H = 450

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

async function renderLucideSvg(Icon: CoverIcon, size = 72): Promise<SVGSVGElement> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;opacity:0'
  document.body.appendChild(host)

  const root = createRoot(host)
  await new Promise<void>((resolve) => {
    root.render(
      createElement(Icon, {
        size,
        color: '#fafafa',
        strokeWidth: 1.75,
      })
    )
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  const svg = host.querySelector('svg')
  if (!svg) {
    root.unmount()
    host.remove()
    throw new Error('Failed to render lucide icon')
  }

  // Detach a clone before unmount so we keep the DOM nodes.
  const clone = svg.cloneNode(true) as SVGSVGElement
  root.unmount()
  host.remove()
  return clone
}

/** Stroke lucide glyph paths directly onto a canvas (no image decode). */
function drawLucideSvg(
  ctx: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  x: number,
  y: number,
  size: number,
  color = '#fafafa'
) {
  const vb = (svg.getAttribute('viewBox') || '0 0 24 24').split(/[\s,]+/).map(Number)
  const vbW = vb[2] || 24
  const vbH = vb[3] || 24
  const scale = size / Math.max(vbW, vbH)

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  // Thicker than lucide default so the glyph stays readable when the
  // plane is scaled down in the 3D sphere.
  ctx.lineWidth = 2.35
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  svg.querySelectorAll('path, line, circle, polyline, polygon, rect, ellipse').forEach((node) => {
    const el = node as SVGElement
    const tag = el.tagName.toLowerCase()
    const fillAttr = el.getAttribute('fill')
    const shouldFill = fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent'

    if (tag === 'path') {
      const d = el.getAttribute('d')
      if (!d) return
      const p = new Path2D(d)
      ctx.stroke(p)
      if (shouldFill) ctx.fill(p)
      return
    }

    if (tag === 'circle') {
      const cx = Number(el.getAttribute('cx') || 0)
      const cy = Number(el.getAttribute('cy') || 0)
      const r = Number(el.getAttribute('r') || 0)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      if (shouldFill) ctx.fill()
      return
    }

    if (tag === 'line') {
      ctx.beginPath()
      ctx.moveTo(Number(el.getAttribute('x1') || 0), Number(el.getAttribute('y1') || 0))
      ctx.lineTo(Number(el.getAttribute('x2') || 0), Number(el.getAttribute('y2') || 0))
      ctx.stroke()
      return
    }

    if (tag === 'polyline' || tag === 'polygon') {
      const points = (el.getAttribute('points') || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n))
      if (points.length < 4) return
      ctx.beginPath()
      ctx.moveTo(points[0]!, points[1]!)
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i]!, points[i + 1]!)
      }
      if (tag === 'polygon') ctx.closePath()
      ctx.stroke()
      if (shouldFill && tag === 'polygon') ctx.fill()
      return
    }

    if (tag === 'rect') {
      const rx = Number(el.getAttribute('x') || 0)
      const ry = Number(el.getAttribute('y') || 0)
      const rw = Number(el.getAttribute('width') || 0)
      const rh = Number(el.getAttribute('height') || 0)
      ctx.strokeRect(rx, ry, rw, rh)
      if (shouldFill) ctx.fillRect(rx, ry, rw, rh)
    }
  })

  ctx.restore()
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  // Prefer wrapping on spaces; for CJK-heavy strings fall back to char chunks.
  const tokens =
    words.length <= 1 && text.length > 12
      ? Array.from(text)
      : words

  const join = (parts: string[]) => (words.length <= 1 && text.length > 12 ? parts.join('') : parts.join(' '))

  let buf: string[] = []
  for (const token of tokens) {
    const next = join([...buf, token])
    if (buf.length && ctx.measureText(next).width > maxWidth) {
      lines.push(join(buf))
      buf = [token]
      if (lines.length >= maxLines) break
    } else {
      buf.push(token)
    }
  }
  if (lines.length < maxLines && buf.length) {
    lines.push(join(buf))
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines)
  }

  // Ellipsis last line if truncated
  if (tokens.length && lines.length === maxLines) {
    const used = lines.join(words.length <= 1 && text.length > 12 ? '' : ' ')
    if (used.length < text.length) {
      let last = lines[maxLines - 1] ?? ''
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = `${last}…`
    }
  }

  return lines
}

/**
 * Build a data-URL cover card with feature icon + title for the image sphere.
 */
export async function createFeatureCover(opts: {
  title: string
  label?: string
  icon: CoverIcon
  accent?: string
}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = COVER_W
  canvas.height = COVER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // Card background
  const pad = 0
  roundRect(ctx, pad, pad, COVER_W - pad * 2, COVER_H - pad * 2, 28)
  const bg = ctx.createLinearGradient(0, 0, COVER_W, COVER_H)
  bg.addColorStop(0, '#141416')
  bg.addColorStop(0.55, '#0c0c0e')
  bg.addColorStop(1, '#18181b')
  ctx.fillStyle = bg
  ctx.fill()

  // Soft accent glow
  const accent = opts.accent ?? '#38bdf8'
  const glow = ctx.createRadialGradient(COVER_W * 0.28, COVER_H * 0.32, 10, COVER_W * 0.28, COVER_H * 0.32, COVER_W * 0.55)
  glow.addColorStop(0, hexToRgba(accent, 0.22))
  glow.addColorStop(1, hexToRgba(accent, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, COVER_W, COVER_H)

  // Inner border
  roundRect(ctx, 1.5, 1.5, COVER_W - 3, COVER_H - 3, 26)
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Icon chip
  const chipX = 48
  const chipY = 52
  const chipSize = 104
  roundRect(ctx, chipX, chipY, chipSize, chipSize, 24)
  ctx.fillStyle = hexToRgba(accent, 0.22)
  ctx.fill()
  roundRect(ctx, chipX, chipY, chipSize, chipSize, 24)
  ctx.strokeStyle = hexToRgba(accent, 0.45)
  ctx.lineWidth = 2
  ctx.stroke()

  try {
    const iconSvg = await renderLucideSvg(opts.icon, 72)
    const iconDraw = 60
    drawLucideSvg(
      ctx,
      iconSvg,
      chipX + (chipSize - iconDraw) / 2,
      chipY + (chipSize - iconDraw) / 2,
      iconDraw,
      '#fafafa'
    )
  } catch {
    // Icon is decorative — continue without it
  }

  // Play badge
  const playR = 22
  const playX = COVER_W - 64
  const playY = 72
  ctx.beginPath()
  ctx.arc(playX, playY, playR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(playX - 5, playY - 10)
  ctx.lineTo(playX - 5, playY + 10)
  ctx.lineTo(playX + 12, playY)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()

  // Title
  ctx.fillStyle = '#fafafa'
  ctx.font = '600 42px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  const titleMaxW = COVER_W - 96
  const titleLines = wrapLines(ctx, opts.title, titleMaxW, 2)
  let ty = 190
  for (const line of titleLines) {
    ctx.fillText(line, 48, ty)
    ty += 52
  }

  // Label / caption
  if (opts.label && opts.label !== opts.title) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '500 22px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    const label = opts.label.length > 42 ? `${opts.label.slice(0, 41)}…` : opts.label
    ctx.fillText(label, 48, Math.min(ty + 12, COVER_H - 56))
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.42)'
    ctx.font = '500 20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.fillText('Click to play', 48, COVER_H - 56)
  }

  // Bottom accent line
  const lineGrad = ctx.createLinearGradient(48, 0, COVER_W - 48, 0)
  lineGrad.addColorStop(0, hexToRgba(accent, 0.55))
  lineGrad.addColorStop(1, hexToRgba(accent, 0))
  ctx.fillStyle = lineGrad
  ctx.fillRect(48, COVER_H - 28, COVER_W - 96, 3)

  return canvas.toDataURL('image/png')
}

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return `rgba(56,189,248,${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}
