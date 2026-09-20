'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import {
  BarChart3Icon,
  BellRingIcon,
  BotIcon,
  CalendarClockIcon,
  CameraIcon,
  Columns3Icon,
  FileCodeIcon,
  GitBranchIcon,
  LayersIcon,
  MonitorPlayIcon,
  MousePointerClickIcon,
  PanelsTopLeftIcon,
  SearchIcon,
  TerminalIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'
import {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
} from '@workspace/ui/components/motion/tabs'
import { useReducedMotion } from 'motion/react'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Badge } from '@workspace/ui/components/ui/badge'
import { LandingFrame } from '@/components/layout/landing-frame'
import { landingPosterUrl, landingVideoUrl } from '@/lib/landing-assets'
import { cn } from '@/lib/utils'

const VIDEO_CROSSFADE_MS = 520
const CAPTION_CROSSFADE_MS = 320

type FeatureKey =
  | 'agent'
  | 'run'
  | 'browser'
  | 'search'
  | 'git'
  | 'terminal'
  | 'usage'
  | 'auto'
  | 'appshots'
  | 'hooks'
  | 'kanban'
  | 'canvas'
  | 'files'
  | 'skills'
  | 'work'

type FeatureDefinition = {
  key: FeatureKey
  icon: LucideIcon
}

/** Demo media filenames on the assets host (`landing/videos/` on R2 for Pages). */
const FEATURE_MEDIA = {
  agent: {
    video: 'agent-terminal-use-flow.mp4',
    poster: 'agent-terminal-use-flow-poster.jpg',
  },
  run: {
    video: 'built-in-terminal-agents.mp4',
    poster: 'built-in-terminal-agents-poster.jpg',
  },
  browser: {
    video: 'Browser-Element-Inspector.mp4',
    poster: 'Browser-Element-Inspector-poster.jpg',
  },
  search: {
    video: 'global-search-command-panel.mp4',
    poster: 'global-search-command-panel-poster.jpg',
  },
  git: {
    video: 'integrated-git-workflow.mp4',
    poster: 'integrated-git-workflow-poster.jpg',
  },
  terminal: {
    video: 'terminal-side-chat.mp4',
    poster: 'terminal-side-chat-poster.jpg',
  },
  usage: {
    video: 'Usage-Analytics-Dashboard.mp4',
    poster: 'Usage-Analytics-Dashboard-poster.jpg',
  },
  auto: {
    video: 'automation.mp4',
    poster: 'automation-poster.jpg',
  },
  appshots: {
    video: 'appshots.mp4',
    poster: 'appshots-poster.jpg',
  },
  hooks: {
    video: 'Agent-Status-Notifications.mp4',
    poster: 'Agent-Status-Notifications-poster.jpg',
  },
  kanban: {
    video: 'Kanban-View.mp4',
    poster: 'Kanban-View-poster.jpg',
  },
  canvas: {
    video: 'canvas.mp4',
    poster: 'canvas-poster.jpg',
  },
  files: {
    video: 'built-in-lightweight-editor.mp4',
    poster: 'built-in-lightweight-editor-poster.jpg',
  },
  skills: {
    video: 'skill-manager.mp4',
    poster: 'skill-manager-poster.jpg',
  },
  work: {
    video: 'multi-workspace-dev.mp4',
    poster: 'multi-workspace-dev-poster.jpg',
  },
} as const satisfies Record<FeatureKey, { video: string; poster: string }>

const featureDefinitions = [
  { key: 'agent', icon: MonitorPlayIcon },
  { key: 'run', icon: BotIcon },
  { key: 'browser', icon: MousePointerClickIcon },
  { key: 'search', icon: SearchIcon },
  { key: 'git', icon: GitBranchIcon },
  { key: 'terminal', icon: TerminalIcon },
  { key: 'usage', icon: BarChart3Icon },
  { key: 'auto', icon: CalendarClockIcon },
  { key: 'appshots', icon: CameraIcon },
  { key: 'hooks', icon: BellRingIcon },
  { key: 'kanban', icon: Columns3Icon },
  { key: 'canvas', icon: PanelsTopLeftIcon },
  { key: 'files', icon: FileCodeIcon },
  { key: 'skills', icon: LayersIcon },
  { key: 'work', icon: WorkflowIcon },
] satisfies FeatureDefinition[]

type FeatureItem = {
  key: FeatureKey
  icon: LucideIcon
  tab: string
  title: string
  description: string
  videoUrl: string
  posterUrl: string
}

const CENTER_TAB_CLASS =
  'pointer-events-auto h-9 shrink-0 gap-2 px-3 text-sm sm:h-10 sm:px-3.5 aria-selected:!text-foreground'

function useTabScrollEdges(scrollerRef: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const { scrollLeft, clientWidth, scrollWidth } = el
    setEdges({
      left: scrollLeft > 2,
      right: scrollLeft + clientWidth < scrollWidth - 2,
    })
  }, [scrollerRef])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [update])

  return { edges, update }
}

function VideoProgressRing({
  progressRef,
  label,
}: {
  progressRef: RefObject<number>
  label: string
}) {
  const circleRef = useRef<SVGCircleElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const size = 22
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    const circle = circleRef.current
    const svg = svgRef.current
    if (!circle) return

    let frame = 0
    const tick = () => {
      const progress = Math.min(1, Math.max(0, progressRef.current))
      circle.style.strokeDashoffset = `${circumference * (1 - progress)}`
      svg?.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [circumference, progressRef])

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-muted-foreground/25"
        strokeWidth={stroke}
      />
      <circle
        ref={circleRef}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-foreground"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        style={{ transition: 'none' }}
      />
    </svg>
  )
}

type VideoLayer = {
  item: FeatureItem
  show: boolean
  instant?: boolean
}

function upsertVideoLayer(prev: VideoLayer[], incoming: FeatureItem, instant: boolean): VideoLayer[] {
  const rest = prev.map((layer) => ({
    ...layer,
    item: layer.item.key === incoming.key ? incoming : layer.item,
    show: false,
  }))
  if (rest.some((layer) => layer.item.key === incoming.key)) {
    return rest.map((layer) => ({
      ...layer,
      show: layer.item.key === incoming.key,
    }))
  }
  return [...rest, { item: incoming, show: true, instant }]
}

function FeatureCaption({
  text,
  durationMs,
}: {
  text: string
  durationMs: number
}) {
  const [shown, setShown] = useState(text)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (text === shown) return
    if (durationMs <= 0) {
      setShown(text)
      setVisible(true)
      return
    }

    setVisible(false)
    const swap = window.setTimeout(() => {
      setShown(text)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }, durationMs)
    return () => window.clearTimeout(swap)
  }, [durationMs, shown, text])

  return (
    <p
      className="px-3 pt-3 text-center text-sm text-muted-foreground sm:px-4 sm:pt-4"
      style={{
        opacity: visible ? 1 : 0,
        transition: durationMs > 0 ? `opacity ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
      }}
    >
      {shown}
    </p>
  )
}

function useVideoCrossfade(active: FeatureItem | undefined, durationMs: number) {
  const [layers, setLayers] = useState<VideoLayer[]>(() =>
    active ? [{ item: active, show: true, instant: true }] : []
  )
  const mountedRef = useRef(false)
  const activeRef = useRef(active)
  const layersRef = useRef(layers)
  activeRef.current = active
  layersRef.current = layers

  useEffect(() => {
    const incoming = activeRef.current
    if (!incoming) return

    const instant = !mountedRef.current || durationMs <= 0
    if (!mountedRef.current) {
      mountedRef.current = true
    }

    setLayers((prev) => upsertVideoLayer(prev, incoming, instant))
  }, [active?.key, durationMs])

  return layers
}

function VideoCrossfadeLayer({
  featureKey,
  show,
  durationMs,
  instant = false,
  children,
}: {
  featureKey: string
  show: boolean
  durationMs: number
  instant?: boolean
  children: ReactNode
}) {
  const [painted, setPainted] = useState(instant || durationMs <= 0)

  useEffect(() => {
    if (instant || durationMs <= 0) {
      setPainted(true)
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPainted(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [durationMs, instant])

  const visible = painted && show

  return (
    <div
      data-video-layer={featureKey}
      data-visible={show ? 'true' : 'false'}
      className={cn('absolute inset-0', !show && 'pointer-events-none')}
      style={{
        opacity: visible ? 1 : 0,
        zIndex: show ? 1 : 0,
        transition:
          durationMs > 0 ? `opacity ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
      }}
    >
      {children}
    </div>
  )
}

function writeVideoProgress(video: HTMLVideoElement, mediaTime: number, progressRef: RefObject<number>) {
  const duration = video.duration
  if (!(duration > 0) || !Number.isFinite(duration)) {
    progressRef.current = 0
    return
  }
  progressRef.current = Math.min(1, Math.max(0, mediaTime / duration))
}

function FeatureDemoVideo({
  title,
  videoUrl,
  posterUrl,
  active,
  onEnded,
  progressRef,
  progressOwnerRef,
}: {
  title: string
  videoUrl: string
  posterUrl: string
  active: boolean
  onEnded: () => void
  progressRef: RefObject<number>
  progressOwnerRef: RefObject<number>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const visibleRef = useRef(true)
  const activeRef = useRef(active)
  const [hasPlayed, setHasPlayed] = useState(false)
  activeRef.current = active

  useEffect(() => {
    setHasPlayed(false)
  }, [videoUrl])

  useEffect(() => {
    const video = videoRef.current
    const frame = frameRef.current
    if (!video || !frame) return

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true

    if (!active) {
      video.pause()
      return
    }

    const owner = ++progressOwnerRef.current
    const ended =
      video.ended ||
      (video.duration > 0 && Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.05)
    if (ended) {
      video.currentTime = 0
    }
    writeVideoProgress(video, video.currentTime, progressRef)

    let lastMedia = Number.isFinite(video.currentTime) ? video.currentTime : 0
    let lastWall = performance.now()
    let rafId = 0
    let rvfcId = 0

    const syncClock = (mediaTime = video.currentTime) => {
      lastMedia = Number.isFinite(mediaTime) ? mediaTime : 0
      lastWall = performance.now()
    }

    const tryPlay = () => {
      if (!activeRef.current || !visibleRef.current) return
      void video
        .play()
        .then(() => syncClock())
        .catch(() => undefined)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = Boolean(entry?.isIntersecting)
        if (visibleRef.current) {
          tryPlay()
        } else {
          video.pause()
        }
      },
      { threshold: 0.05, rootMargin: '80px 0px 80px 0px' }
    )
    observer.observe(frame)

    const onPlaying = () => syncClock()
    const onPause = () => syncClock()

    const tickRaf = () => {
      if (progressOwnerRef.current !== owner) return
      if (!video.paused && !video.ended) {
        const elapsed = ((performance.now() - lastWall) / 1000) * (video.playbackRate || 1)
        let estimated = lastMedia + elapsed
        const actual = video.currentTime
        if (Number.isFinite(actual) && actual > 0.05 && estimated - actual > 0.5) {
          syncClock(actual)
          estimated = actual
        }
        const duration = video.duration
        const mediaTime =
          duration > 0 && Number.isFinite(duration) ? Math.min(duration, Math.max(0, estimated)) : estimated
        writeVideoProgress(video, mediaTime, progressRef)
      } else {
        writeVideoProgress(video, video.currentTime, progressRef)
      }
      rafId = requestAnimationFrame(tickRaf)
    }

    const tickFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (progressOwnerRef.current !== owner) return
      if (metadata.mediaTime > lastMedia + 1e-4) {
        lastMedia = metadata.mediaTime
        lastWall = performance.now()
      }
      rvfcId = video.requestVideoFrameCallback(tickFrame)
    }

    video.addEventListener('canplay', tryPlay)
    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('seeked', onPlaying)
    video.addEventListener('pause', onPause)
    tryPlay()

    if (typeof video.requestVideoFrameCallback === 'function') {
      rvfcId = video.requestVideoFrameCallback(tickFrame)
    }
    rafId = requestAnimationFrame(tickRaf)

    return () => {
      cancelAnimationFrame(rafId)
      if (rvfcId && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(rvfcId)
      }
      observer.disconnect()
      video.removeEventListener('canplay', tryPlay)
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('seeked', onPlaying)
      video.removeEventListener('pause', onPause)
      video.pause()
    }
  }, [active, progressOwnerRef, progressRef, videoUrl])

  return (
    <div ref={frameRef} className="absolute inset-0 overflow-hidden">
      <img
        src={posterUrl}
        alt=""
        className={cn(
          'absolute inset-0 size-full object-cover object-top transition-opacity duration-300',
          hasPlayed ? 'opacity-0' : 'opacity-100'
        )}
      />
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover object-top"
        src={videoUrl}
        poster={posterUrl}
        muted
        playsInline
        preload="auto"
        aria-label={title}
        suppressHydrationWarning
        onPlaying={() => setHasPlayed(true)}
        onEnded={() => {
          if (active) onEnded()
        }}
      />
    </div>
  )
}

export default function FeatureShowcase() {
  const t = useTranslations('featureShowcase')
  const reduceMotion = useReducedMotion()
  const [activeKey, setActiveKey] = useState<FeatureKey>('agent')
  const progressRef = useRef(0)
  const progressOwnerRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { edges, update: updateScrollEdges } = useTabScrollEdges(scrollerRef)

  const features = useMemo<FeatureItem[]>(
    () =>
      featureDefinitions.map((feature) => {
        const media = FEATURE_MEDIA[feature.key]
        return {
          key: feature.key,
          icon: feature.icon,
          tab: t(`features.${feature.key}.tab`),
          title: t(`features.${feature.key}.title`),
          description: t(`features.${feature.key}.description`),
          videoUrl: landingVideoUrl(media.video),
          posterUrl: landingPosterUrl(media.poster),
        }
      }),
    [t]
  )

  const active = features.find((feature) => feature.key === activeKey) ?? features[0]
  const layers = useVideoCrossfade(active, reduceMotion ? 0 : VIDEO_CROSSFADE_MS)

  const selectFeature = useCallback((key: string) => {
    setActiveKey(key as FeatureKey)
  }, [])

  const advanceFeature = useCallback(() => {
    const index = features.findIndex((feature) => feature.key === activeKey)
    const next = features[(index + 1) % features.length]
    if (next) {
      setActiveKey(next.key)
    }
  }, [activeKey, features])

  useEffect(() => {
    const scroller = scrollerRef.current
    const selected = scroller?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    )
    if (!scroller || !selected) return
    const selectedRect = selected.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const left =
      scroller.scrollLeft +
      (selectedRect.left - scrollerRect.left) -
      (scroller.clientWidth - selectedRect.width) / 2
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    updateScrollEdges()
  }, [activeKey, updateScrollEdges])

  return (
    <section id="features" className="relative">
      <MotionPreset fade blur transition={{ duration: 0.5 }} delay={0.15} className="relative">
        <LandingFrame>
          <div className="flex w-full min-w-0 flex-col items-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
            <div className="flex w-full max-w-xl flex-col items-center text-center">
              <Badge variant="outline" className="rounded-none">
                {t('badge')}
              </Badge>
              <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:mt-4 sm:text-3xl lg:text-4xl">
                {t('title')}
              </h2>
            </div>

            <div className="mt-6 w-full min-w-0 overflow-hidden rounded-[28px] border border-border bg-transparent p-1.5 sm:mt-8 sm:rounded-t-[38px] sm:rounded-br-[38px] sm:rounded-bl-[52px] sm:p-[18px]">
              <div className="mb-2 flex w-full min-w-0 items-center gap-2 sm:mb-3 lg:mb-[18px]">
                <MotionTabs
                  value={activeKey}
                  onValueChange={selectFeature}
                  variant="pill"
                  className="min-w-0 flex-1"
                >
                  <MotionTabsList
                    className={cn(
                      'flex h-11 w-full min-w-0 max-w-full justify-start overflow-hidden bg-transparent p-1',
                      edges.left &&
                        edges.right &&
                        '[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)]',
                      edges.left &&
                        !edges.right &&
                        '[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_2.5rem,black)]',
                      !edges.left &&
                        edges.right &&
                        '[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]'
                    )}
                    indicatorClassName="bg-active"
                  >
                    <div
                      ref={scrollerRef}
                      data-center-tabs-scroll=""
                      className="flex min-w-0 w-full items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {features.map((feature) => {
                        const Icon = feature.icon
                        return (
                          <MotionTabsTrigger
                            key={feature.key}
                            value={feature.key}
                            title={feature.tab}
                            className={CENTER_TAB_CLASS}
                          >
                            <Icon className="size-4" />
                            <span className="whitespace-nowrap">{feature.tab}</span>
                          </MotionTabsTrigger>
                        )
                      })}
                    </div>
                  </MotionTabsList>
                </MotionTabs>
                <div className="flex h-10 shrink-0 items-center pr-0.5">
                  <VideoProgressRing
                    progressRef={progressRef}
                    label={active?.title ?? t('title')}
                  />
                </div>
              </div>

              <div
                role="tabpanel"
                className="relative aspect-[16/10] w-full min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950"
              >
                {layers.map((layer) => (
                  <VideoCrossfadeLayer
                    key={layer.item.key}
                    featureKey={layer.item.key}
                    show={layer.show}
                    durationMs={reduceMotion ? 0 : VIDEO_CROSSFADE_MS}
                    instant={layer.instant}
                  >
                    <FeatureDemoVideo
                      title={layer.item.title}
                      videoUrl={layer.item.videoUrl}
                      posterUrl={layer.item.posterUrl}
                      active={layer.show}
                      onEnded={advanceFeature}
                      progressRef={progressRef}
                      progressOwnerRef={progressOwnerRef}
                    />
                  </VideoCrossfadeLayer>
                ))}
              </div>

              {active ? (
                <FeatureCaption
                  text={active.description}
                  durationMs={reduceMotion ? 0 : CAPTION_CROSSFADE_MS}
                />
              ) : null}
            </div>
          </div>
        </LandingFrame>
      </MotionPreset>
    </section>
  )
}
