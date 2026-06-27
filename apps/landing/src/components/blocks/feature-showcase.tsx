'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
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

type FeaturePlacement = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left'

type Feature = {
  title: string
  label: string
  description: string
  icon: LucideIcon
  placement: FeaturePlacement
  gridAreaClass: string
}

const FEATURE_VIDEO_URL = '/videos/atmos-intro-editorial.mp4'
const FEATURE_POSTER_URL = '/videos/atmos-intro-editorial-poster.jpg'

const features = [
  {
    title: 'AI Agent Workspace',
    label: 'Agent',
    description: 'Streaming responses, tool-call updates, permissions, and custom ACP agents in one workspace.',
    icon: BotIcon,
    placement: 'top-left',
    gridAreaClass: 'col-start-1 row-start-1',
  },
  {
    title: 'Project Wiki',
    label: 'Wiki',
    description: 'URL-synced project knowledge that agents can generate, refresh, and use as working context.',
    icon: BookOpenIcon,
    placement: 'top',
    gridAreaClass: 'col-start-2 row-start-1',
  },
  {
    title: 'Global Search',
    label: 'Search',
    description: 'A command surface for jumping between workspaces, files, actions, and app-level tools.',
    icon: SearchIcon,
    placement: 'top',
    gridAreaClass: 'col-start-3 row-start-1',
  },
  {
    title: 'Integrated Git Workflow',
    label: 'Git',
    description: 'Diff review, branch state, AI-assisted commits, and PR context stay in the same cockpit.',
    icon: GitBranchIcon,
    placement: 'top',
    gridAreaClass: 'col-start-4 row-start-1',
  },
  {
    title: 'Review Workflow',
    label: 'Review',
    description: 'Inline review comments, threaded revisions, and terminal fix runners for agent handoff.',
    icon: GitPullRequestIcon,
    placement: 'top',
    gridAreaClass: 'col-start-5 row-start-1',
  },
  {
    title: 'Run Preview',
    label: 'Run',
    description: 'Run scripts, preview output, and verify changes without leaving the development surface.',
    icon: PlayIcon,
    placement: 'top-right',
    gridAreaClass: 'col-start-6 row-start-1',
  },
  {
    title: 'Terminal & Tmux',
    label: 'Terminal',
    description: 'Persistent tmux-backed terminals survive reloads, reconnect cleanly, and keep agent work alive.',
    icon: TerminalIcon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-2',
  },
  {
    title: 'Usage Analytics',
    label: 'Usage',
    description: 'Provider-specific token usage, subscription quota tracking, and cost estimates for AI work.',
    icon: BarChart3Icon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-3',
  },
  {
    title: 'Local Automations',
    label: 'Auto',
    description: 'Scheduled and manual terminal-agent runs with artifacts, notifications, and issue automation.',
    icon: CalendarClockIcon,
    placement: 'right',
    gridAreaClass: 'col-start-6 row-start-4',
  },
  {
    title: 'Atmos Computer',
    label: 'Remote',
    description: 'Register remote machines, connect from Desktop or Hosted Web, and run terminals anywhere.',
    icon: MonitorIcon,
    placement: 'bottom-right',
    gridAreaClass: 'col-start-6 row-start-5',
  },
  {
    title: 'Local Model Runtime',
    label: 'Models',
    description: 'Run lightweight llama-server models locally for TODO extraction and commit-message help.',
    icon: CpuIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-5 row-start-5',
  },
  {
    title: 'Agent Hooks',
    label: 'Hooks',
    description: 'Hook-based lifecycle sync shows running, idle, waiting, and done states across the UI.',
    icon: BellRingIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-4 row-start-5',
  },
  {
    title: 'Workspace Kanban',
    label: 'Kanban',
    description: 'Drag workspace cards through status, priority, labels, issues, and PR-linked workflows.',
    icon: Columns3Icon,
    placement: 'bottom',
    gridAreaClass: 'col-start-3 row-start-5',
  },
  {
    title: 'Canvas Workbench',
    label: 'Canvas',
    description: 'Pin terminals, notes, and diagrams from multiple projects onto a persistent working board.',
    icon: PanelsTopLeftIcon,
    placement: 'bottom',
    gridAreaClass: 'col-start-2 row-start-5',
  },
  {
    title: 'Mobile Companion',
    label: 'Mobile',
    description: 'Expo mobile surfaces keep remote workspaces, git state, and terminal follow-up within reach.',
    icon: SmartphoneIcon,
    placement: 'bottom-left',
    gridAreaClass: 'col-start-1 row-start-5',
  },
  {
    title: 'Live File Tree',
    label: 'Files',
    description: 'Live file status, inline previews, and quick edits keep manual coding close to agent work.',
    icon: FileCodeIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-4',
  },
  {
    title: 'Skill Management',
    label: 'Skills',
    description: 'Discover, enable, disable, and tune skills and custom agent definitions from settings.',
    icon: LayersIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-3',
  },
  {
    title: 'Multi-Workspace Isolation',
    label: 'Work',
    description: 'Git worktree isolation lets multiple agents operate in parallel without trampling changes.',
    icon: WorkflowIcon,
    placement: 'left',
    gridAreaClass: 'col-start-1 row-start-2',
  },
] satisfies Feature[]

const topFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'top')
const rightFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'right')
const bottomFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'bottom').reverse()
const leftFeatures = features.filter((feature) => getFeatureEdgePlacement(feature.placement) === 'left').reverse()

const DURATION = 5000 // 5 seconds per slide

export default function FeatureShowcase() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Track the actual video element to control playback if needed
  const videoRef = useRef<HTMLVideoElement>(null)

  // Combined effect: manage timer and auto-advance slides
  useEffect(() => {
    if (isHovering) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const nextProgress = prev + (100 / (DURATION / 50))
        if (nextProgress >= 100) {
          // Use setTimeout to defer state update and avoid cascading renders
          setTimeout(() => {
            setActiveIndex((idx) => (idx + 1) % features.length)
          }, 0)
          return 0
        }
        return nextProgress
      })
    }, 50)

    timerRef.current = interval

    return () => {
      clearInterval(interval)
    }
  }, [isHovering])

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

        <div className='mx-auto w-full max-w-7xl shrink-0 space-y-8 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                Features
              </Badge>
            </MotionPreset>
            <MotionPreset delay={0.3} transition={{ duration: 0.5 }}>
              <h2 className='text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                See Atmos in Action
              </h2>
            </MotionPreset>
          </div>

          {/* Container for Video & Nav */}
          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.4} inView={false}>
            <div>
              <div className="hidden gap-2 lg:flex lg:flex-col">
                <div className="grid grid-cols-6 gap-2">
                  {topFeatures.map((feature) => {
                    const index = features.indexOf(feature)

                    return (
                      <FeatureActionButton
                        key={feature.title}
                        feature={feature}
                        isActive={index === activeIndex}
                        progress={progress}
                        onClick={() => handleManualChange(index)}
                      />
                    )
                  })}
                </div>

                <div className="grid min-h-0 grid-cols-[3.875rem_minmax(0,1fr)_3.875rem] gap-2">
                  <div className="grid grid-rows-3 gap-2">
                    {leftFeatures.map((feature) => {
                      const index = features.indexOf(feature)

                      return (
                        <FeatureActionButton
                          key={feature.title}
                          feature={feature}
                          isActive={index === activeIndex}
                          progress={progress}
                          onClick={() => handleManualChange(index)}
                        />
                      )
                    })}
                  </div>

                  <FeaturePreview
                    videoRef={videoRef}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  />

                  <div className="grid grid-rows-3 gap-2">
                    {rightFeatures.map((feature) => {
                      const index = features.indexOf(feature)

                      return (
                        <FeatureActionButton
                          key={feature.title}
                          feature={feature}
                          isActive={index === activeIndex}
                          progress={progress}
                          onClick={() => handleManualChange(index)}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-2">
                  {bottomFeatures.map((feature) => {
                    const index = features.indexOf(feature)

                    return (
                      <FeatureActionButton
                        key={feature.title}
                        feature={feature}
                        isActive={index === activeIndex}
                        progress={progress}
                        onClick={() => handleManualChange(index)}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="lg:hidden">
                <FeaturePreview
                  videoRef={videoRef}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                />
                <div className="-mx-2 mt-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1">
                  {features.map((feature, index) => (
                    <FeatureActionButton
                      key={feature.title}
                      feature={feature}
                      isActive={index === activeIndex}
                      progress={progress}
                      onClick={() => handleManualChange(index)}
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
  onMouseEnter,
  onMouseLeave,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      className="relative aspect-video min-h-0 w-full overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/10 group"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <video
        ref={videoRef}
        src={FEATURE_VIDEO_URL}
        poster={FEATURE_POSTER_URL}
        autoPlay
        muted
        loop
        className="size-full object-cover"
        playsInline
        suppressHydrationWarning
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
  const toneClass = 'bg-background text-foreground shadow-sm dark:bg-zinc-900'

  return (
    <button
      type="button"
      aria-label={feature.title}
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'relative isolate flex cursor-pointer overflow-hidden border-0 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
        toneClass,
        !isActive && 'hover:bg-muted/60 dark:hover:bg-white/[0.07]',
        isMobile
          ? 'h-12 min-w-[10.5rem] snap-start items-center gap-2 rounded-lg px-3'
          : cn(
            'min-h-0',
            isSide
              ? 'h-full w-full items-center justify-center rounded-xl px-0'
              : 'h-12 items-center justify-center gap-2 rounded-xl px-3'
          )
      )}
    >
      {isActive && (
        <span className="absolute inset-0">
          <motion.span
            className={cn('block bg-foreground/[0.08] dark:bg-white/[0.08]', isSide ? 'w-full' : 'h-full')}
            style={isSide ? { height: `${progress}%` } : { width: `${progress}%` }}
            transition={{ duration: 0, ease: 'linear' }}
          />
        </span>
      )}

      <span
        className={cn(
          'relative z-10 flex items-center gap-1.5',
          isSide ? 'w-24 justify-center' : 'min-w-0',
          isLeftSide && 'rotate-90',
          isRightSide && 'rotate-90'
        )}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/50"
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className={cn('text-xs font-semibold leading-none', isSide ? 'shrink-0' : 'min-w-0 truncate')}>
          {feature.label}
        </span>
      </span>
    </button>
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
