import { createElement, type ComponentType, type SVGProps } from 'react'
import { createRoot } from 'react-dom/client'

export type CoverIcon = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; absoluteStrokeWidth?: boolean }
>

const COVER_W = 960
const COVER_H = 540
const FALLBACK_POSTER = '/videos/atmos-intro-editorial-poster.jpg'

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

  const clone = svg.cloneNode(true) as SVGSVGElement
  root.unmount()
  host.remove()
  return clone
}

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
  ctx.lineWidth = 2.35
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  svg.querySelectorAll('path, line, circle, polyline, polygon, rect, ellipse').forEach((node) => {
    const el = node as SVGElement
    const tag = el.tagName.toLowerCase()
    const fillAttr = el.getAttribute('fill')
    const shouldFill = Boolean(fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent')

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/** Capture a still frame from a demo video for use as sphere cover art. */
async function captureVideoPoster(videoUrl: string): Promise<HTMLCanvasElement | HTMLImageElement> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = videoUrl

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(`Failed to load video: ${videoUrl}`))
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('error', onError)
    video.load()
  })

  const targetTime = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(1.2, Math.max(0.15, video.duration * 0.08))
    : 0.4

  if (video.readyState >= 2) {
    try {
      video.currentTime = targetTime
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
        // Fallback if seeked never fires (already at target)
        window.setTimeout(() => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }, 600)
      })
    } catch {
      // keep current frame
    }
  }

  const vw = video.videoWidth || COVER_W
  const vh = video.videoHeight || COVER_H
  const frame = document.createElement('canvas')
  frame.width = vw
  frame.height = vh
  const fctx = frame.getContext('2d')
  if (!fctx) throw new Error('2D context unavailable for video frame')
  fctx.drawImage(video, 0, 0, vw, vh)

  // Release media resources
  video.pause()
  video.removeAttribute('src')
  video.load()

  return frame
}

function drawCoverContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number
) {
  // Cover-fit into COVER_W x COVER_H
  const scale = Math.max(COVER_W / sw, COVER_H / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (COVER_W - dw) / 2
  const dy = (COVER_H - dh) / 2
  ctx.drawImage(source, dx, dy, dw, dh)
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const tokens = words.length <= 1 && text.length > 14 ? Array.from(text) : words
  const join = (parts: string[]) =>
    words.length <= 1 && text.length > 14 ? parts.join('') : parts.join(' ')

  const lines: string[] = []
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
  if (lines.length < maxLines && buf.length) lines.push(join(buf))

  if (tokens.length && lines.length === maxLines) {
    const used = lines.join(words.length <= 1 && text.length > 14 ? '' : ' ')
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
 * Build a data-URL cover from a video frame, with feature icon + title overlay.
 */
export async function createFeatureCover(opts: {
  title: string
  videoUrl: string
  icon: CoverIcon
  accent?: string
}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = COVER_W
  canvas.height = COVER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // 1) Video poster frame (fallback to editorial poster)
  try {
    const frame = await captureVideoPoster(opts.videoUrl)
    const sw =
      frame instanceof HTMLVideoElement
        ? frame.videoWidth
        : frame instanceof HTMLImageElement
          ? frame.naturalWidth
          : frame.width
    const sh =
      frame instanceof HTMLVideoElement
        ? frame.videoHeight
        : frame instanceof HTMLImageElement
          ? frame.naturalHeight
          : frame.height
    drawCoverContain(ctx, frame, sw || COVER_W, sh || COVER_H)
  } catch {
    try {
      const img = await loadImage(FALLBACK_POSTER)
      drawCoverContain(ctx, img, img.naturalWidth || COVER_W, img.naturalHeight || COVER_H)
    } catch {
      ctx.fillStyle = '#0c0c0e'
      ctx.fillRect(0, 0, COVER_W, COVER_H)
    }
  }

  // 2) Center scrim so icon + title stay readable on busy video frames
  const scrim = ctx.createRadialGradient(
    COVER_W / 2,
    COVER_H / 2,
    COVER_H * 0.08,
    COVER_W / 2,
    COVER_H / 2,
    COVER_W * 0.55
  )
  scrim.addColorStop(0, 'rgba(0,0,0,0.62)')
  scrim.addColorStop(0.55, 'rgba(0,0,0,0.38)')
  scrim.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, COVER_W, COVER_H)

  // 3) Soft card border
  roundRect(ctx, 1.5, 1.5, COVER_W - 3, COVER_H - 3, 22)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 4) Centered icon chip + title (stacked, slightly larger)
  const accent = opts.accent ?? '#38bdf8'
  const chipSize = 88
  const iconDraw = 50
  const titleMaxW = COVER_W * 0.78
  const lineH = 48
  const gapIconTitle = 22

  ctx.font = '600 42px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
  const lines = wrapLines(ctx, opts.title, titleMaxW, 2)
  const titleBlockH = lines.length * lineH
  const stackH = chipSize + gapIconTitle + titleBlockH
  const stackTop = (COVER_H - stackH) / 2

  const chipX = (COVER_W - chipSize) / 2
  const chipY = stackTop
  roundRect(ctx, chipX, chipY, chipSize, chipSize, 22)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fill()
  roundRect(ctx, chipX, chipY, chipSize, chipSize, 22)
  ctx.strokeStyle = hexToRgba(accent, 0.6)
  ctx.lineWidth = 1.75
  ctx.stroke()

  try {
    const iconSvg = await renderLucideSvg(opts.icon, 72)
    drawLucideSvg(
      ctx,
      iconSvg,
      chipX + (chipSize - iconDraw) / 2,
      chipY + (chipSize - iconDraw) / 2,
      iconDraw,
      '#fafafa'
    )
  } catch {
    // decorative
  }

  // 5) Title centered under icon
  ctx.fillStyle = '#fafafa'
  ctx.font = '600 42px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let ty = chipY + chipSize + gapIconTitle
  for (const line of lines) {
    ctx.fillText(line, COVER_W / 2, ty)
    ty += lineH
  }
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'

  // 6) Small play badge (corner)
  const playR = 22
  const playX = COVER_W - 56
  const playY = 48
  ctx.beginPath()
  ctx.arc(playX, playY, playR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(playX - 5, playY - 10)
  ctx.lineTo(playX - 5, playY + 10)
  ctx.lineTo(playX + 12, playY)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()

  return canvas.toDataURL('image/jpeg', 0.88)
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
