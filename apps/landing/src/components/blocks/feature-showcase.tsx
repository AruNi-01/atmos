'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
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
  Maximize2Icon,
  Minimize2Icon,
  MousePointerClickIcon,
  PauseIcon,
  PanelsTopLeftIcon,
  PlayIcon,
  SearchIcon,
  TerminalIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Badge } from '@workspace/ui/components/ui/badge'
import { Button } from '@workspace/ui/components/ui/button'

type FeaturePlacement = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left'

type FeatureKey =
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
  placement: FeaturePlacement
}

type Feature = {
  key: FeatureKey
  index: number
  title: string
  label: string
  description: string
  icon: LucideIcon
  placement: FeaturePlacement
  videoUrl: string
}

const FEATURE_POSTER_URL = '/videos/atmos-intro-editorial-poster.jpg'

/** Only features with a dedicated demo video are shown — no intro fallback. */
const FEATURE_VIDEOS = {
  run: '/videos/built-in-terminal-agents.mp4',
  browser: '/videos/Browser-Element-Inspector.mp4',
  search: '/videos/global-search-command-panel.mp4',
  git: '/videos/integrated-git-workflow.mp4',
  terminal: '/videos/terminal-side-chat.mp4',
  usage: '/videos/Usage-Analytics-Dashboard.mp4',
  auto: '/videos/automation.mp4',
  appshots: '/videos/appshots.mp4',
  hooks: '/videos/Agent-Status-Notifications.mp4',
  kanban: '/videos/Kanban-View.mp4',
  canvas: '/videos/canvas.mp4',
  files: '/videos/built-in-lightweight-editor.mp4',
  skills: '/videos/skill-manager.mp4',
  work: '/videos/multi-workspace-dev.mp4',
} as const satisfies Record<FeatureKey, string>

const featureDefinitions = [
  {
    key: 'run',
    icon: BotIcon,
    placement: 'top-left',
  },
  {
    key: 'browser',
    icon: MousePointerClickIcon,
    placement: 'top',
  },
  {
    key: 'search',
    icon: SearchIcon,
    placement: 'top',
  },
  {
    key: 'git',
    icon: GitBranchIcon,
    placement: 'top-right',
  },
  {
    key: 'terminal',
    icon: TerminalIcon,
    placement: 'right',
  },
  {
    key: 'usage',
    icon: BarChart3Icon,
    placement: 'right',
  },
  {
    key: 'auto',
    icon: CalendarClockIcon,
    placement: 'right',
  },
  {
    key: 'appshots',
    icon: CameraIcon,
    placement: 'bottom-right',
  },
  {
    key: 'hooks',
    icon: BellRingIcon,
    placement: 'bottom',
  },
  {
    key: 'kanban',
    icon: Columns3Icon,
    placement: 'bottom',
  },
  {
    key: 'canvas',
    icon: PanelsTopLeftIcon,
    placement: 'bottom-left',
  },
  {
    key: 'files',
    icon: FileCodeIcon,
    placement: 'left',
  },
  {
    key: 'skills',
    icon: LayersIcon,
    placement: 'left',
  },
  {
    key: 'work',
    icon: WorkflowIcon,
    placement: 'left',
  },
] satisfies FeatureDefinition[]

const EDGE_GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
}

export default function FeatureShowcase() {
  const t = useTranslations('featureShowcase')
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  // Bumps on every feature switch so stale video time updates are ignored
  const [progressEpoch, setProgressEpoch] = useState(0)
  const isPausedRef = useRef(false)
  isPausedRef.current = isPaused

  const features = featureDefinitions.map((feature, index) => ({
    ...feature,
    index,
    title: t(`features.${feature.key}.title`),
    label: t(`features.${feature.key}.label`),
    description: t(`features.${feature.key}.description`),
    videoUrl: FEATURE_VIDEOS[feature.key],
  })) satisfies Feature[]
  const topFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'top')
  const rightFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'right')
  const bottomFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'bottom').reverse()
  const leftFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'left').reverse()
  const activeVideoUrl = features[activeIndex]?.videoUrl ?? FEATURE_VIDEOS.run

  const handleTimeUpdate = useCallback((currentTime: number, duration: number, epoch: number) => {
    // Pause must freeze chip progress even if a hidden/mobile video instance is still ticking
    if (isPausedRef.current) return
    if (epoch !== progressEpoch) return
    if (!(duration > 0) || !Number.isFinite(duration) || !Number.isFinite(currentTime)) return
    setProgress(Math.min(100, Math.max(0, (currentTime / duration) * 100)))
  }, [progressEpoch])

  const handleVideoEnded = useCallback(() => {
    setProgress(0)
    setIsPaused(false)
    setProgressEpoch((epoch) => epoch + 1)
    setActiveIndex((idx) => (idx + 1) % featureDefinitions.length)
  }, [])

  const handleManualChange = (index: number) => {
    if (index === activeIndex) return
    setProgress(0)
    setIsPaused(false)
    setProgressEpoch((epoch) => epoch + 1)
    setActiveIndex(index)
  }

  return (
    <section id="features" className='relative'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='relative overflow-hidden border-y xl:flex'
      >
        <div className='m-6 w-full shrink-2 max-xl:hidden'></div>

        <div className='mx-auto w-full min-w-0 max-w-6xl shrink-0 space-y-6 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                {t('badge')}
              </Badge>
            </MotionPreset>
            <MotionPreset delay={0.3} transition={{ duration: 0.5 }}>
              <h2 className='text-balance text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                {t('title')}
              </h2>
            </MotionPreset>
          </div>

          {/* Container for Video & Nav */}
          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.4} inView={false}>
            <div>
              <div className="hidden gap-2 lg:flex lg:flex-col">
                <div className={cn('grid gap-2', EDGE_GRID_COLS[topFeatures.length] ?? 'grid-cols-5')}>
                  {topFeatures.map((feature) => {
                    return (
                      <FeatureActionButton
                        key={feature.key}
                        feature={feature}
                        isActive={feature.index === activeIndex}
                        progress={progress}
                        onClick={() => handleManualChange(feature.index)}
                      />
                    )
                  })}
                </div>

                <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] gap-2 items-stretch">
                  <div className="flex min-h-0 flex-col gap-2">
                    {leftFeatures.map((feature) => {
                      return (
                        <FeatureActionButton
                          key={feature.key}
                          feature={feature}
                          isActive={feature.index === activeIndex}
                          progress={progress}
                          onClick={() => handleManualChange(feature.index)}
                        />
                      )
                    })}
                  </div>

                  <FeaturePreview
                    videoUrl={activeVideoUrl}
                    progressEpoch={progressEpoch}
                    isPaused={isPaused}
                    onPausedChange={setIsPaused}
                    isHovering={isHovering}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleVideoEnded}
                  />

                  <div className="flex min-h-0 flex-col gap-2">
                    {rightFeatures.map((feature) => {
                      return (
                        <FeatureActionButton
                          key={feature.key}
                          feature={feature}
                          isActive={feature.index === activeIndex}
                          progress={progress}
                          onClick={() => handleManualChange(feature.index)}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className={cn('grid gap-2', EDGE_GRID_COLS[bottomFeatures.length] ?? 'grid-cols-4')}>
                  {bottomFeatures.map((feature) => {
                    return (
                      <FeatureActionButton
                        key={feature.key}
                        feature={feature}
                        isActive={feature.index === activeIndex}
                        progress={progress}
                        onClick={() => handleManualChange(feature.index)}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="min-w-0 lg:hidden">
                <FeaturePreview
                  videoUrl={activeVideoUrl}
                  progressEpoch={progressEpoch}
                  isPaused={isPaused}
                  onPausedChange={setIsPaused}
                  isHovering={isHovering}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  alwaysShowChrome
                />
                <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {features.map((feature) => (
                    <FeatureActionButton
                      key={feature.key}
                      feature={feature}
                      isActive={feature.index === activeIndex}
                      progress={progress}
                      onClick={() => handleManualChange(feature.index)}
                      isMobile
                    />
                  ))}
                </div>
              </div>
            </div>
          </MotionPreset>
        </div>

        <div className='m-6 w-full shrink-2 max-xl:hidden'></div>
      </MotionPreset>
    </section>
  )
}

const VIDEO_CROSSFADE_MS = 450

function videoSrcMatches(el: HTMLVideoElement, expectedUrl: string) {
  const src = el.currentSrc || el.src || ''
  if (!src || !expectedUrl) return false
  // Compare by path tail so absolute vs relative URLs both work
  const expectedTail = expectedUrl.split('/').filter(Boolean).pop() ?? expectedUrl
  return src.includes(expectedTail)
}

function FeaturePreview({
  videoUrl,
  progressEpoch,
  isPaused,
  onPausedChange,
  isHovering,
  onMouseEnter,
  onMouseLeave,
  onTimeUpdate,
  onEnded,
  alwaysShowChrome = false,
}: {
  videoUrl: string
  progressEpoch: number
  isPaused: boolean
  onPausedChange: (paused: boolean) => void
  isHovering: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTimeUpdate: (currentTime: number, duration: number, epoch: number) => void
  onEnded: () => void
  alwaysShowChrome?: boolean
}) {
  const t = useTranslations('featureShowcase')
  const containerRef = useRef<HTMLDivElement>(null)
  const layer0Ref = useRef<HTMLVideoElement>(null)
  const layer1Ref = useRef<HTMLVideoElement>(null)
  const [urls, setUrls] = useState<[string, string]>([videoUrl, videoUrl])
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Suppress progress until the incoming layer is ready on the expected src
  const [progressReady, setProgressReady] = useState(true)

  const lastUrlRef = useRef(videoUrl)
  const activeIndexRef = useRef(activeIndex)
  const progressEpochRef = useRef(progressEpoch)
  const isPausedRef = useRef(isPaused)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  activeIndexRef.current = activeIndex
  progressEpochRef.current = progressEpoch
  isPausedRef.current = isPaused

  const getLayer = (index: 0 | 1) => (index === 0 ? layer0Ref.current : layer1Ref.current)

  const playLayer = (index: 0 | 1, reset = false) => {
    const el = getLayer(index)
    if (!el) return
    if (reset) {
      try {
        el.currentTime = 0
      } catch {
        // ignore seek before metadata
      }
    }
    if (!isPausedRef.current) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }

  // Initial autoplay
  useEffect(() => {
    playLayer(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Immediately freeze progress whenever the parent starts a new feature epoch
  // so the previous layer cannot paint a stale % onto the new chip.
  const isFirstEpochEffectRef = useRef(true)
  useEffect(() => {
    if (isFirstEpochEffectRef.current) {
      isFirstEpochEffectRef.current = false
      return
    }
    setProgressReady(false)
    onTimeUpdate(0, 1, progressEpoch)
  }, [progressEpoch, onTimeUpdate])

  // Dual-layer crossfade on feature change
  useEffect(() => {
    if (videoUrl === lastUrlRef.current) return
    lastUrlRef.current = videoUrl

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }

    // Freeze progress at 0 until the new src is actually playing
    setProgressReady(false)
    onTimeUpdate(0, 1, progressEpochRef.current)

    const outgoing = activeIndexRef.current
    const incoming = (outgoing === 0 ? 1 : 0) as 0 | 1

    setUrls((prev) => {
      const next: [string, string] = [prev[0], prev[1]]
      next[incoming] = videoUrl
      return next
    })

    const kickoff = window.setTimeout(() => {
      const el = getLayer(incoming)
      if (el) {
        el.muted = true
        try {
          el.currentTime = 0
        } catch {
          // ignore
        }
      }
      playLayer(incoming, true)
      setActiveIndex(incoming)

      // Arm progress once the new layer reports the expected src + valid duration
      const armProgress = () => {
        const video = getLayer(incoming)
        if (!video) return
        if (videoSrcMatches(video, videoUrl) && video.duration > 0 && Number.isFinite(video.duration)) {
          setProgressReady(true)
          if (!isPausedRef.current) {
            onTimeUpdate(video.currentTime || 0, video.duration, progressEpochRef.current)
          }
          return true
        }
        return false
      }

      if (!armProgress()) {
        const onMeta = () => {
          if (armProgress()) {
            el?.removeEventListener('loadedmetadata', onMeta)
            el?.removeEventListener('canplay', onMeta)
          }
        }
        el?.addEventListener('loadedmetadata', onMeta)
        el?.addEventListener('canplay', onMeta)
        // Fallback so progress never stays locked forever
        window.setTimeout(() => {
          setProgressReady(true)
          el?.removeEventListener('loadedmetadata', onMeta)
          el?.removeEventListener('canplay', onMeta)
        }, 800)
      }

      settleTimerRef.current = setTimeout(() => {
        getLayer(outgoing)?.pause()
        settleTimerRef.current = null
      }, VIDEO_CROSSFADE_MS + 60)
    }, 40)

    return () => {
      window.clearTimeout(kickoff)
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  // Manual pause / resume (shared parent state; not hover)
  useEffect(() => {
    const el = getLayer(activeIndex)
    if (!el) return
    if (isPaused) {
      el.pause()
    } else {
      el.play().catch(() => {})
    }
  }, [isPaused, activeIndex])

  // Progress from the active layer — only while playing
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      if (progressReady && !isPausedRef.current) {
        const el = getLayer(activeIndexRef.current)
        if (
          el &&
          !el.paused &&
          el.duration > 0 &&
          Number.isFinite(el.duration) &&
          videoSrcMatches(el, lastUrlRef.current)
        ) {
          onTimeUpdate(el.currentTime, el.duration, progressEpochRef.current)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [onTimeUpdate, progressReady])

  // Track native fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      const node = containerRef.current
      setIsFullscreen(Boolean(node && document.fullscreenElement === node))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const handleEnded = (layerIndex: 0 | 1) => {
    if (layerIndex === activeIndexRef.current && !isPausedRef.current) {
      onEnded()
    }
  }

  const togglePlayPause = () => {
    onPausedChange(!isPaused)
  }

  const toggleFullscreen = async () => {
    const node = containerRef.current
    if (!node) return
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen()
      } else {
        await node.requestFullscreen()
      }
    } catch {
      // Fullscreen may be blocked by the browser
    }
  }

  // Feature demos are mostly ~1872×1080 (≈1.73), not true 16:9.
  // Cover the frame so the video always fills edge-to-edge (no side letterboxing).
  const layerClassName =
    'absolute inset-0 size-full object-cover object-center transition-opacity ease-out'

  const showChrome = alwaysShowChrome || isHovering || isFullscreen

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[1872/1080] min-h-0 w-full min-w-0 overflow-hidden rounded-xl border border-border/60 bg-zinc-950 shadow-2xl shadow-black/10 sm:rounded-2xl"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <video
        ref={layer0Ref}
        src={urls[0]}
        poster={FEATURE_POSTER_URL}
        muted
        playsInline
        preload="auto"
        suppressHydrationWarning
        className={layerClassName}
        style={{
          opacity: activeIndex === 0 ? 1 : 0,
          transitionDuration: `${VIDEO_CROSSFADE_MS}ms`,
          zIndex: activeIndex === 0 ? 2 : 1,
        }}
        onEnded={() => handleEnded(0)}
      />
      <video
        ref={layer1Ref}
        src={urls[1]}
        muted
        playsInline
        preload="auto"
        suppressHydrationWarning
        className={layerClassName}
        style={{
          opacity: activeIndex === 1 ? 1 : 0,
          transitionDuration: `${VIDEO_CROSSFADE_MS}ms`,
          zIndex: activeIndex === 1 ? 2 : 1,
        }}
        onEnded={() => handleEnded(1)}
      />

      {/* Hover / fullscreen controls — playback continues unless user pauses */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-10 transition-opacity duration-200',
          showChrome ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={isPaused ? t('video.play') : t('video.pause')}
            title={isPaused ? t('video.play') : t('video.pause')}
            onClick={togglePlayPause}
            className="size-8 rounded-md border border-white/10 bg-black/45 text-white hover:bg-black/65 hover:text-white"
          >
            {isPaused ? (
              <PlayIcon className="size-3.5" aria-hidden="true" />
            ) : (
              <PauseIcon className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={isFullscreen ? t('video.exitFullscreen') : t('video.fullscreen')}
            title={isFullscreen ? t('video.exitFullscreen') : t('video.fullscreen')}
            onClick={toggleFullscreen}
            className="size-8 rounded-md border border-white/10 bg-black/45 text-white hover:bg-black/65 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2Icon className="size-3.5" aria-hidden="true" />
            ) : (
              <Maximize2Icon className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FeatureActionButton({
  feature,
  isActive,
  progress,
  onClick,
  isMobile = false,
}: {
  feature: Feature
  isActive: boolean
  progress: number
  onClick: () => void
  isMobile?: boolean
}) {
  const Icon = feature.icon
  const edgePlacement = getFeatureEdgePlacement(feature.placement)
  const isLeftSide = edgePlacement === 'left' && !isMobile
  const isRightSide = edgePlacement === 'right' && !isMobile
  const isSide = isLeftSide || isRightSide
  const toneClass = 'bg-background text-foreground shadow-sm dark:bg-zinc-900 border border-border/40'

  // Keep top/bottom thickness and side strip width in sync (Button size="sm" sets sm:h-7).
  const chipThickness = '!h-14'
  const sideStripWidth = 'w-14'

  if (isSide) {
    // Rotation wrapper: horizontal button rotated vertical.
    // Slot flex-grows to fill video height; button width tracks slot height via cqh.
    // Visual strip width after rotate = chipThickness (must match top/bottom height).
    return (
      <div
        className={cn('relative min-h-0 flex-1', sideStripWidth)}
        style={{ containerType: 'size' }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={feature.title}
          aria-pressed={isActive}
          onClick={onClick}
          className={cn(
            'absolute left-1/2 top-1/2 flex w-[100cqh] max-w-none -translate-x-1/2 -translate-y-1/2 cursor-pointer overflow-hidden text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
            toneClass,
            !isActive && 'hover:bg-muted/60 dark:hover:bg-white/[0.07]',
            chipThickness,
            'items-center justify-center gap-1.5 !rounded-md px-2.5',
            isLeftSide ? '-rotate-90' : 'rotate-90'
          )}
        >
          {isActive && (
            <span className="absolute inset-0">
              <motion.span
                className="block h-full bg-foreground/[0.08] dark:bg-white/[0.08]"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0, ease: 'linear' }}
              />
            </span>
          )}

          <span className="relative z-10 flex min-w-0 w-full items-center justify-center gap-1.5">
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate text-[11px] font-semibold leading-none select-none">
              {feature.label}
            </span>
          </span>
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={feature.title}
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'relative isolate flex cursor-pointer overflow-hidden text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
        toneClass,
        !isActive && 'hover:bg-muted/60 dark:hover:bg-white/[0.07]',
        isMobile ? 'min-w-[7.5rem] shrink-0 snap-start sm:min-w-[10.5rem]' : 'w-full',
        isMobile ? '!h-11' : chipThickness,
        'items-center gap-2 !rounded-md px-3'
      )}
    >
      {isActive && (
        <span className="absolute inset-0">
          <motion.span
            className="block h-full bg-foreground/[0.08] dark:bg-white/[0.08]"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0, ease: 'linear' }}
          />
        </span>
      )}

      <span className="relative z-10 flex items-center gap-1.5 min-w-0 w-full justify-center">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold leading-none truncate select-none">
          {feature.label}
        </span>
      </span>
    </Button>
  )
}

function getFeatureEdgePlacement(placement: FeaturePlacement): 'top' | 'right' | 'bottom' | 'left' {
  switch (placement) {
    case 'top-left':
    case 'top-right':
    case 'top':
      return 'top'
    case 'bottom-right':
    case 'bottom-left':
    case 'bottom':
      return 'bottom'
    case 'right':
      return 'right'
    case 'left':
      return 'left'
    default:
      return placement
  }
}
