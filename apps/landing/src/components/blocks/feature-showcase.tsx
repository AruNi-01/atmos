'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
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
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Badge } from '@workspace/ui/components/ui/badge'
import { FeatureImageSphere, type FeatureSphereItem } from '@/components/image-sphere/feature-image-sphere'
import { LandingFrame } from '@/components/layout/landing-frame'

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

/** Demo media: MP4 plays on focus; poster is a prebuilt still for sphere covers. */
const FEATURE_MEDIA = {
  // Hero product overview (moved from the first section)
  agent: {
    videoUrl: '/videos/agent-terminal-use-flow.mp4',
    posterUrl: '/videos/agent-terminal-use-flow-poster.jpg',
  },
  run: {
    videoUrl: '/videos/built-in-terminal-agents.mp4',
    posterUrl: '/videos/built-in-terminal-agents-poster.jpg',
  },
  browser: {
    videoUrl: '/videos/Browser-Element-Inspector.mp4',
    posterUrl: '/videos/Browser-Element-Inspector-poster.jpg',
  },
  search: {
    videoUrl: '/videos/global-search-command-panel.mp4',
    posterUrl: '/videos/global-search-command-panel-poster.jpg',
  },
  git: {
    videoUrl: '/videos/integrated-git-workflow.mp4',
    posterUrl: '/videos/integrated-git-workflow-poster.jpg',
  },
  terminal: {
    videoUrl: '/videos/terminal-side-chat.mp4',
    posterUrl: '/videos/terminal-side-chat-poster.jpg',
  },
  usage: {
    videoUrl: '/videos/Usage-Analytics-Dashboard.mp4',
    posterUrl: '/videos/Usage-Analytics-Dashboard-poster.jpg',
  },
  auto: {
    videoUrl: '/videos/automation.mp4',
    posterUrl: '/videos/automation-poster.jpg',
  },
  appshots: {
    videoUrl: '/videos/appshots.mp4',
    posterUrl: '/videos/appshots-poster.jpg',
  },
  hooks: {
    videoUrl: '/videos/Agent-Status-Notifications.mp4',
    posterUrl: '/videos/Agent-Status-Notifications-poster.jpg',
  },
  kanban: {
    videoUrl: '/videos/Kanban-View.mp4',
    posterUrl: '/videos/Kanban-View-poster.jpg',
  },
  canvas: {
    videoUrl: '/videos/canvas.mp4',
    posterUrl: '/videos/canvas-poster.jpg',
  },
  files: {
    videoUrl: '/videos/built-in-lightweight-editor.mp4',
    posterUrl: '/videos/built-in-lightweight-editor-poster.jpg',
  },
  skills: {
    videoUrl: '/videos/skill-manager.mp4',
    posterUrl: '/videos/skill-manager-poster.jpg',
  },
  work: {
    videoUrl: '/videos/multi-workspace-dev.mp4',
    posterUrl: '/videos/multi-workspace-dev-poster.jpg',
  },
} as const satisfies Record<FeatureKey, { videoUrl: string; posterUrl: string }>

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

export default function FeatureShowcase() {
  const t = useTranslations('featureShowcase')
  const [mediaFocused, setMediaFocused] = useState(false)

  const features = useMemo(
    () =>
      featureDefinitions.map(
        (feature): FeatureSphereItem => {
          const media = FEATURE_MEDIA[feature.key]
          return {
            id: feature.key,
            icon: feature.icon,
            title: t(`features.${feature.key}.title`),
            label: t(`features.${feature.key}.label`),
            description: t(`features.${feature.key}.description`),
            videoUrl: media.videoUrl,
            posterUrl: media.posterUrl,
          }
        }
      ),
    [t]
  )

  return (
    <section id="features" className="relative">
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className="relative overflow-hidden border-y"
      >
        <LandingFrame>
          {/* Sphere fills the whole section; title + edge dust overlays on top */}
          <div className="relative w-full min-w-0">
            <FeatureImageSphere
              features={features}
              onFocusChange={setMediaFocused}
              // Cap under the visual viewport (dvh). The sphere uses
              // touch-action:none for 3D drag — if this block fills the screen,
              // mobile users cannot page-scroll past it.
              className="h-[min(68dvh,560px)] max-h-[100dvh] sm:h-[min(78dvh,720px)] md:h-[min(85dvh,860px)] lg:h-[min(88dvh,920px)]"
            />

            {/* Soft edge dust — thin, hugs the section rails (fade out while focused) */}
            <div
              className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ease-out ${
                mediaFocused ? 'opacity-0' : 'opacity-100'
              }`}
              aria-hidden
            >
              <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background via-background/50 to-transparent sm:h-14" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background via-background/45 to-transparent sm:h-12" />
              <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background via-background/40 to-transparent sm:w-8" />
              <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background via-background/40 to-transparent sm:w-8" />
            </div>

            {/*
              Always mount heading so SSR/client HTML match. Animate only after
              hydration via mediaFocused (initial={false} avoids enter mismatch).
            */}
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2.5 px-4 pt-8 sm:px-6 sm:pt-16 lg:px-8"
              initial={false}
              animate={{
                opacity: mediaFocused ? 0 : 1,
                y: mediaFocused ? -10 : 0,
              }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden={mediaFocused}
            >
              <Badge variant="outline" className="rounded-none bg-background/70 backdrop-blur-sm">
                {t('badge')}
              </Badge>
              <h2 className="text-balance text-2xl font-semibold sm:text-3xl lg:text-4xl">{t('title')}</h2>
            </motion.div>
          </div>
        </LandingFrame>
      </MotionPreset>
    </section>
  )
}
