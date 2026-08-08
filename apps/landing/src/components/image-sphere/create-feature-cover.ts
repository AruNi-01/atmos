import { createElement, type ComponentType, type SVGProps } from 'react'
import { flushSync } from 'react-dom'
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

/** Serialize concurrent React icon mounts — parallel createRoot was dropping SVGs. */
let iconRenderChain: Promise<unknown> = Promise.resolve()

function enqueueIconRender<T>(task: () => Promise<T>): Promise<T> {
  const run = iconRenderChain.then(task, task)
  iconRenderChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/**
 * Render a Lucide icon to a raster image via SVG data-URL.
 * More reliable than hand-walking path nodes (stroke lives on the <svg> root).
 */
async function renderLucideIconImage(
  Icon: CoverIcon,
  size = 72,
  color = '#fafafa'
): Promise<HTMLImageElement> {
  return enqueueIconRender(async () => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;opacity:0'
    document.body.appendChild(host)

    const root = createRoot(host)
    try {
      flushSync(() => {
        root.render(
          createElement(Icon, {
            size,
            color,
            strokeWidth: 1.75,
          })
        )
      })

      const svg = host.querySelector('svg')
      if (!svg) throw new Error('Failed to render lucide icon')

      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('width', String(size))
      svg.setAttribute('height', String(size))
      // currentColor / CSS class strokes do not serialize into canvas-friendly SVG
      const stroke = svg.getAttribute('stroke')
      if (!stroke || stroke === 'currentColor') {
        svg.setAttribute('stroke', color)
      }
      if (!svg.getAttribute('fill')) {
        svg.setAttribute('fill', 'none')
      }

      const xml = new XMLSerializer().serializeToString(svg)
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
      return await loadImage(url)
    } finally {
      root.unmount()
      host.remove()
    }
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // data: / blob: do not need CORS; setting crossOrigin can break data-URL loads
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Last-resort runtime frame grab when no prebuilt poster exists.
 * Prefer static `*-poster.jpg` assets — pulling full MP4s just for covers is slow.
 */
async function captureVideoPoster(videoUrl: string): Promise<HTMLCanvasElement | HTMLImageElement> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
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

type CoverBackground = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement

async function loadCoverBackground(
  posterUrl: string | undefined,
  videoUrl: string
): Promise<CoverBackground> {
  if (posterUrl) {
    try {
      return await loadImage(posterUrl)
    } catch {
      // fall through to video / editorial poster
    }
  }

  try {
    return await captureVideoPoster(videoUrl)
  } catch {
    return await loadImage(FALLBACK_POSTER)
  }
}

function sourceSize(source: CoverBackground): { sw: number; sh: number } {
  if (source instanceof HTMLVideoElement) {
    return { sw: source.videoWidth || COVER_W, sh: source.videoHeight || COVER_H }
  }
  if (source instanceof HTMLImageElement) {
    return { sw: source.naturalWidth || COVER_W, sh: source.naturalHeight || COVER_H }
  }
  return {
    sw: source.width || COVER_W,
    sh: source.height || COVER_H,
  }
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
 * Build a data-URL cover with feature icon + title overlay.
 * Prefer a prebuilt `posterUrl` (static jpg) so the sphere never waits on MP4s.
 */
export async function createFeatureCover(opts: {
  title: string
  videoUrl: string
  /** Pre-extracted still (e.g. `/videos/foo-poster.jpg`). Strongly preferred. */
  posterUrl?: string
  icon: CoverIcon
  accent?: string
}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = COVER_W
  canvas.height = COVER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // 1) Background: static poster → runtime video frame → editorial fallback
  try {
    const frame = await loadCoverBackground(opts.posterUrl, opts.videoUrl)
    const { sw, sh } = sourceSize(frame)
    drawCoverContain(ctx, frame, sw, sh)
  } catch {
    ctx.fillStyle = '#0c0c0e'
    ctx.fillRect(0, 0, COVER_W, COVER_H)
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
    const iconImg = await renderLucideIconImage(opts.icon, 72, '#fafafa')
    const iconX = chipX + (chipSize - iconDraw) / 2
    const iconY = chipY + (chipSize - iconDraw) / 2
    ctx.drawImage(iconImg, iconX, iconY, iconDraw, iconDraw)
  } catch (err) {
    console.warn('[feature-cover] icon render failed', err)
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
