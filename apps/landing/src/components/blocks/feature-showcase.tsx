'use client'

import { useMemo } from 'react'
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
}

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
        className="relative overflow-hidden border-y xl:flex"
      >
        <div className="m-6 w-full shrink-2 max-xl:hidden" />

        <div className="mx-auto w-full min-w-0 max-w-6xl shrink-0 space-y-6 px-4 py-8 min-[1158px]:border-x sm:space-y-10 sm:px-6 sm:py-16 lg:px-8">
          <div className="space-y-2.5">
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant="outline" className="rounded-none">
                {t('badge')}
              </Badge>
            </MotionPreset>
            <MotionPreset delay={0.3} transition={{ duration: 0.5 }}>
              <h2 className="text-balance text-2xl font-semibold sm:text-3xl lg:text-4xl">{t('title')}</h2>
            </MotionPreset>
            <MotionPreset delay={0.35} fade transition={{ duration: 0.5 }}>
              <p className="max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
                {t('sphere.subtitle')}
              </p>
            </MotionPreset>
          </div>

          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.4} inView={false}>
            <FeatureImageSphere features={features} />
          </MotionPreset>
        </div>

        <div className="m-6 w-full shrink-2 max-xl:hidden" />
      </MotionPreset>
    </section>
  )
}
