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

/** Only features with a dedicated demo video are shown — no intro fallback. */
const FEATURE_VIDEOS = {
  // Hero product overview (moved from the first section)
  agent: '/videos/agent-terminal-use-flow.mp4',
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
        (feature): FeatureSphereItem => ({
          id: feature.key,
          icon: feature.icon,
          title: t(`features.${feature.key}.title`),
          label: t(`features.${feature.key}.label`),
          description: t(`features.${feature.key}.description`),
          videoUrl: FEATURE_VIDEOS[feature.key],
        })
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
              className="min-h-[min(88vh,860px)] h-[min(88vh,860px)] sm:min-h-[min(90vh,920px)] sm:h-[min(90vh,920px)]"
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
