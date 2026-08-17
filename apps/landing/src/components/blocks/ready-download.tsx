'use client'

import { useState } from 'react'

import { ArrowRightIcon, ChevronDownIcon, CheckIcon, CopyIcon, TerminalIcon } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu'

import { TabsSubtle, TabsSubtleItem } from '@workspace/ui/components/ui/tabs-subtle'
import type { ComponentType, ReactNode } from 'react'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { TextShimmer } from '@workspace/ui/components/ui/text-shimmer'
import { GithubIcon } from '@workspace/ui/components/icons/github-icon'
import { BlinkingGrid } from '@/components/ui/blinking-grid'
import { LandingFrame, landingRailClassName } from '@/components/layout/landing-frame'
import { Button } from '@workspace/ui/components/ui/button'
import { Badge } from '@workspace/ui/components/ui/badge'
import { OsIcon } from '@/components/os-icon'
import type { DownloadLinks } from '@/lib/desktop-download-links'

const RELEASES_URL = 'https://github.com/AruNi-01/atmos/releases'
const APP_URL = 'https://app.atmos.land'

type TabIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const HomebrewIcon: TabIcon = ({ size = 16, className }) => (
  <img
    src='/icons/homebrew.svg'
    alt=''
    width={size}
    height={size}
    className={className}
    style={{ width: size, height: size }}
  />
)

const DESKTOP_TABS = [
  { id: 'bash', labelKey: 'tabs.bash', icon: TerminalIcon },
  { id: 'homebrew', labelKey: 'tabs.homebrew', icon: HomebrewIcon },
] as const

type ReadyDownloadProps = {
  /** Server-resolved direct R2 installer URLs (install.atmos.land). */
  downloadLinks: Pick<DownloadLinks, 'macAppleSilicon' | 'macIntel' | 'windows' | 'linux'>
}

const ReadyDownload = ({ downloadLinks }: ReadyDownloadProps) => {
  const t = useTranslations('readyDownload')
  const [copied, setCopied] = useState('')
  const [desktopTabIndex, setDesktopTabIndex] = useState(0)
  const desktopTab = DESKTOP_TABS[desktopTabIndex]?.id ?? 'bash'

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 2000)
  }

  const renderInstallCommand = (command: string, icon: ReactNode) => (
    <div className='flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md border bg-muted/30 py-1 pr-1 pl-3 font-mono text-xs text-foreground shadow-sm sm:pl-4 sm:text-sm'>
      <span className='pointer-events-none shrink-0 opacity-60 select-none'>{icon}</span>
      <span className='min-w-0 flex-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <TextShimmer as='code' className='block w-max whitespace-nowrap text-left'>
          {command}
        </TextShimmer>
      </span>
      <Button
        variant='ghost'
        size='icon'
        className='size-9 shrink-0 transition-opacity sm:size-10'
        onClick={() => copyToClipboard(command)}
        aria-label={t('copyCommand')}
      >
        {copied === command ? (
          <CheckIcon className='size-4 text-green-500' />
        ) : (
          <CopyIcon className='size-4 text-muted-foreground' />
        )}
      </Button>
    </div>
  )

  return (
    <section id='ready-download'>
      <MotionPreset className='relative overflow-hidden border-y bg-background'>
        <LandingFrame
          side={<BlinkingGrid className={landingRailClassName} />}
          contentClassName='bg-background'
        >
        <div className='flex w-full min-w-0 flex-col items-center justify-center px-4 py-12 pb-8 sm:px-6 sm:py-16 sm:pb-10 lg:px-8 lg:py-20 lg:pb-10'>
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 50 }}
            blur
            transition={{ duration: 0.5 }}
            className='flex w-full min-w-0 max-w-3xl flex-col items-center space-y-6 text-center sm:space-y-8'
          >
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                {t('badge')}
              </Badge>
            </MotionPreset>

            <h2 className='w-full text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-5xl lg:text-6xl'>
              {t('title')}
            </h2>

            <p className='w-full max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg md:text-xl'>
              {t('description')}
            </p>

            <div className='flex w-full max-w-md flex-col items-stretch gap-3 pt-2 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4 sm:pt-4'>
              <div className='relative isolate flex w-full items-center overflow-hidden rounded-lg ring-2 ring-primary/60 sm:w-72'>
                <Button size='lg' className='h-12 flex-1 rounded-r-none border-r border-primary-foreground/20 px-4 text-sm font-medium transition-colors hover:bg-primary sm:h-14 sm:px-6 sm:text-base' asChild>
                  <Link href={downloadLinks.macAppleSilicon} target='_blank' rel='noopener noreferrer'>
                    <OsIcon os='apple' className='size-5' />
                    {t('primaryCta')}
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size='lg' className='h-12 rounded-l-none border-none px-3 ring-0 transition-colors hover:bg-primary hover:text-primary-foreground sm:h-14'>
                      <ChevronDownIcon className='size-5' />
                      <span className='sr-only'>{t('moreOptions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-[calc(100vw-2rem)] max-w-72 font-medium sm:w-72'>
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.macAppleSilicon} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='apple' className='size-4' />
                        {t('macAppleSilicon')}
                        <span className='ml-auto text-xs text-muted-foreground'>{t('default')}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.macIntel} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='apple' className='size-4' />
                        {t('macIntel')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.windows} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='windows' className='size-4' />
                        {t('windows')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.linux} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='linux' className='size-4' />
                        {t('linux')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={RELEASES_URL} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <GithubIcon size={16} className='text-current' />
                        {t('viewReleases')}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button size='lg' variant='ghost' className='h-12 px-6 text-sm sm:h-14 sm:px-8 sm:text-base' asChild>
                <Link href={APP_URL} target='_blank' rel='noopener noreferrer' className='group'>
                  {t('openInBrowser')}
                  <ArrowRightIcon className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </Button>
            </div>

            <div className='mt-4 w-full min-w-0 max-w-2xl space-y-6 sm:mt-8 sm:space-y-8'>
              {/* Desktop Installation */}
              <div className='w-full min-w-0 space-y-3 text-left'>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2'>
                  <div className='flex items-center gap-2'>
                    <OsIcon os='apple' className='size-4 shrink-0 text-muted-foreground' />
                    <h3 className='text-sm font-medium text-muted-foreground'>{t('desktopApp')}</h3>
                  </div>
                  <TabsSubtle
                    idPrefix='desktop-install'
                    activeLabel
                    selectedIndex={desktopTabIndex}
                    onSelect={setDesktopTabIndex}
                    className='w-full min-w-0 sm:w-auto'
                  >
                    {DESKTOP_TABS.map((tab, index) => (
                      <TabsSubtleItem
                        key={tab.id}
                        index={index}
                        label={t(tab.labelKey)}
                        icon={tab.icon}
                      />
                    ))}
                  </TabsSubtle>
                </div>

                {desktopTab === 'homebrew' &&
                  renderInstallCommand(
                    'brew install --cask AruNi-01/tap/atmos',
                    <img src='/icons/homebrew.svg' alt='' className='size-4' />
                  )}

                {desktopTab === 'bash' &&
                  renderInstallCommand(
                    'curl -fsSL https://install.atmos.land/install-desktop.sh | bash',
                    <TerminalIcon className='size-4' />
                  )}
              </div>
            </div>
          </MotionPreset>
        </div>
        </LandingFrame>
      </MotionPreset>
    </section>
  )
}

export default ReadyDownload
