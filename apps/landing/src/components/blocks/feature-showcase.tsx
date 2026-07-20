'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import {
  BarChart3Icon,
  BellRingIcon,
  BookOpenIcon,
  BotIcon,
  CalendarClockIcon,
  Columns3Icon,
  CpuIcon,
  FileCodeIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LayersIcon,
  MonitorIcon,
  PanelsTopLeftIcon,
  PlayIcon,
  SearchIcon,
  SmartphoneIcon,
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
  | 'agent'
  | 'wiki'
  | 'search'
  | 'git'
  | 'review'
  | 'run'
  | 'terminal'
  | 'usage'
  | 'auto'
  | 'remote'
  | 'models'
  | 'hooks'
  | 'kanban'
  | 'canvas'
  | 'mobile'
  | 'files'
  | 'skills'
  | 'work'

type FeatureDefinition = {
  key: FeatureKey
  icon: LucideIcon
  placement: FeaturePlacement
  gridAreaClass: string
  videoUrl?: string
}

type Feature = {
  key: FeatureKey
  index: number
  title: string
  label: string
  description: string
  icon: LucideIcon
  placement: FeaturePlacement
  gridAreaClass: string
  videoUrl: string
}

const FEATURE_VIDEO_URL = '/videos/atmos-intro-editorial.mp4'
const FEATURE_POSTER_URL = '/videos/atmos-intro-editorial-poster.jpg'

const FEATURE_VIDEOS: Partial<Record<FeatureKey, string>> = {
  agent: '/videos/agent-terminal-use-flow.mp4',
  terminal: '/videos/terminal-side-chat.mp4',
  run: '/videos/built-in-terminal-agents.mp4',
  files: '/videos/built-in-lightweight-editor.mp4',
  search: '/videos/global-search-command-panel.mp4',
  git: '/videos/integrated-git-workflow.mp4',
  work: '/videos/multi-workspace-dev.mp4',
  skills: '/videos/skill-manager.mp4',
  kanban: '/videos/Kanban-View.mp4',
  usage: '/videos/Usage-Analytics-Dashboard.mp4',
  hooks: '/videos/Agent-Status-Notifications.mp4',
}

const featureDefinitions = [
  {
    key: 'agent',
    icon: BotIcon,
    placement: 'top-left',
    gridAreaClass: 'col-start-1 row-start-1',
  },
  {
    key: 'wiki',
    icon: BookOpenIcon,
    placement: 'top',
    gridAreaClass: 'col-start-2 row-start-1',
  },
  {
    key: 'search',
    icon: SearchIcon,
    placement: 'top',
    gridAreaClass: 'col-start-3 row-start-1',
  },
  {
    key: 'git',
    icon: GitBranchIcon,
    placement: 'top',
    gridAreaClass: 'col-start-4 row-start-1',
  },
  {
    key: 'review',
    icon: GitPullRequestIcon,
    placement: 'top',
    gridAreaClass: 'col-start-5 row-start-1',
  },
  {
    key: 'run',
    icon: PlayIcon,
    placement: 'top-right',
    gridAreaClass: 'col-start-6 row-start-1',
  },
  {
    key: 'terminal',
    icon: TerminalIcon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-2',
  },
  {
    key: 'usage',
    icon: BarChart3Icon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-3',
  },
  {
    key: 'auto',
    icon: CalendarClockIcon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-4',
  },
  {
    key: 'remote',
    icon: MonitorIcon,
    placement: 'bottom-right',
    gridAreaClass: 'col-start-6 row-start-5',
  },
  {
    key: 'models',
    icon: CpuIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-5 row-start-5',
  },
  {
    key: 'hooks',
    icon: BellRingIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-4 row-start-5',
  },
  {
    key: 'kanban',
    icon: Columns3Icon,
    placement: 'bottom',
    gridAreaClass: 'col-start-3 row-start-5',
  },
  {
    key: 'canvas',
    icon: PanelsTopLeftIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-2 row-start-5',
  },
  {
    key: 'mobile',
    icon: SmartphoneIcon,
    placement: 'bottom-left',
    gridAreaClass: 'col-start-1 row-start-5',
  },
  {
    key: 'files',
    icon: FileCodeIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-4',
  },
  {
    key: 'skills',
    icon: LayersIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-3',
  },
  {
    key: 'work',
    icon: WorkflowIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-2',
  },
] satisfies FeatureDefinition[]

export default function FeatureShowcase() {
  const t = useTranslations('featureShowcase')
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const features = featureDefinitions.map((feature, index) => ({
    ...feature,
    index,
    title: t(`features.${feature.key}.title`),
    label: t(`features.${feature.key}.label`),
    description: t(`features.${feature.key}.description`),
    videoUrl: FEATURE_VIDEOS[feature.key] ?? FEATURE_VIDEO_URL,
  })) satisfies Feature[]
  const topFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'top')
  const rightFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'right')
  const bottomFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'bottom').reverse()
  const leftFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'left').reverse()

  // Video-driven progress: update progress bar based on actual video playback
  const handleTimeUpdate = (currentTime: number, duration: number) => {
    if (!isHovering && duration > 0) {
      setProgress((currentTime / duration) * 100)
    }
  }

  // Auto-advance to next feature when video ends
  const handleVideoEnded = () => {
    if (!isHovering) {
      setProgress(0)
      setActiveIndex((idx) => (idx + 1) % featureDefinitions.length)
    }
  }

  // Reset progress when active index changes manually
  const handleManualChange = (index: number) => {
    setActiveIndex(index)
    setProgress(0)
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

        <div className='mx-auto w-full max-w-6xl shrink-0 space-y-8 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                {t('badge')}
              </Badge>
            </MotionPreset>
            <MotionPreset delay={0.3} transition={{ duration: 0.5 }}>
              <h2 className='text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                {t('title')}
              </h2>
            </MotionPreset>
          </div>

          {/* Container for Video & Nav */}
          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.4} inView={false}>
            <div>
              <div className="hidden gap-2 lg:flex lg:flex-col">
                <div className="grid grid-cols-6 gap-2">
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

                <div className="grid min-h-0 grid-cols-[3rem_minmax(0,1fr)_3rem] gap-2 items-center">
                  <div className="flex flex-col gap-2 justify-center">
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
                    videoRef={videoRef}
                    videoUrl={features[activeIndex]?.videoUrl ?? FEATURE_VIDEO_URL}
                    isHovering={isHovering}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleVideoEnded}
                  />

                  <div className="flex flex-col gap-2 justify-center">
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

                <div className="grid grid-cols-6 gap-2">
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

              <div className="lg:hidden">
                <FeaturePreview
                  videoRef={videoRef}
                  videoUrl={features[activeIndex]?.videoUrl ?? FEATURE_VIDEO_URL}
                  isHovering={isHovering}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                />
                <div className="-mx-2 mt-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1">
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

function FeaturePreview({
  videoRef,
  videoUrl,
  isHovering,
  onMouseEnter,
  onMouseLeave,
  onTimeUpdate,
  onEnded,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  videoUrl: string
  isHovering: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onTimeUpdate: (currentTime: number, duration: number) => void
  onEnded: () => void
}) {
  const [src, setSrc] = useState(videoUrl)
  const [opacity, setOpacity] = useState(1)
  const lastUrlRef = useRef(videoUrl)

  // 1. Single-video transition loop
  useEffect(() => {
    if (videoUrl === lastUrlRef.current) return
    lastUrlRef.current = videoUrl

    // Fade out first
    setOpacity(0)

    // Wait 150ms, swap src, fade in
    const t = setTimeout(() => {
      setSrc(videoUrl)
      setOpacity(1)
    }, 150)

    return () => clearTimeout(t)
  }, [videoUrl])

  // 2. Playback control
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (isHovering) {
      vid.pause()
    } else {
      vid.play().catch(() => {})
    }
  }, [isHovering, src, videoRef])

  // 3. Smooth progress tracking using requestAnimationFrame
  useEffect(() => {
    let rafId: number
    const update = () => {
      const vid = videoRef.current
      if (vid && !vid.paused && vid.duration && opacity === 1) {
        if (vid.src.endsWith(videoUrl)) {
          onTimeUpdate(vid.currentTime, vid.duration)
        }
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [videoUrl, opacity, onTimeUpdate, videoRef])

  return (
    <div
      className="relative aspect-video min-h-0 w-full overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/10 group"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <video
        ref={videoRef}
        src={src}
        poster={FEATURE_POSTER_URL}
        autoPlay
        muted
        className="absolute inset-0 size-full object-cover transition-opacity duration-150"
        style={{ opacity }}
        playsInline
        suppressHydrationWarning
        onEnded={onEnded}
      />
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

  if (isSide) {
    // Rotation Wrapper: visually rotates a horizontal button to be vertical
    // Width becomes height (104px) and height becomes width (48px)
    const sideBtnWidth = 'w-[6.5rem]'
    const sideContainerHeight = 'h-[6.5rem]'

    return (
      <div className={cn("relative w-12 flex items-center justify-center shrink-0", sideContainerHeight)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={feature.title}
          aria-pressed={isActive}
          onClick={onClick}
          className={cn(
            'absolute flex cursor-pointer overflow-hidden text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
            toneClass,
            !isActive && 'hover:bg-muted/60 dark:hover:bg-white/[0.07]',
            'h-12 items-center justify-center gap-2 rounded-xl px-3',
            sideBtnWidth,
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

          <span className="relative z-10 flex items-center gap-1.5 min-w-0 w-full justify-center">
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold leading-none truncate select-none">
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
        isMobile ? 'h-12 min-w-[10.5rem] snap-start' : 'h-12 w-full',
        'items-center gap-2 rounded-xl px-3'
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
