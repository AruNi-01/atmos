'use client'

import { useLocale } from 'next-intl'
import { ArrowUpRightIcon } from 'lucide-react'
import { Link } from '@atmos/i18n/navigation'

import { Badge } from '@workspace/ui/components/ui/badge'
import { Separator } from '@workspace/ui/components/ui/separator'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { CraftButton, CraftButtonIcon, CraftButtonLabel } from '@workspace/ui/components/ui/craft-button'
import { BlinkingGrid } from '@/components/ui/blinking-grid'
import { changelogData } from '@/lib/changelog-data'
import { cn, formatDate } from '@/lib/utils'

const LatestChanges = () => {
  const locale = useLocale()
  const language = locale === 'zh' ? 'zh' : 'en'
  const clearCurrentHashBeforeNavigation = () => {
    if (typeof window === 'undefined' || !window.location.hash) return
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }

  const latestChangesData = changelogData.slice(0, 3).map((item) => ({
    id: item.id,
    version: item.version,
    title: item.title[language],
    description: item.description[language].replace(/`([^`]*)`/g, '$1').replace(/\*\*/g, '').replace(/\*/g, ''),
    time: formatDate(new Date(item.date), language),
  }))

  const renderReleaseCard = (item: (typeof latestChangesData)[number], titleClamp: string) => (
    <Link
      href={{
        pathname: '/changelog',
        hash: item.version ? `v${item.version}` : undefined,
      }}
      onClick={clearCurrentHashBeforeNavigation}
      className={cn(
        'group w-full rounded-2xl border bg-background p-5 transition-colors hover:bg-muted/30',
        'outline-hidden ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        {item.version ? (
          <p className='font-mono text-xs font-medium text-primary'>v{item.version}</p>
        ) : (
          <span />
        )}
        <ArrowUpRightIcon className='mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground' />
      </div>
      <h3 className={cn('text-sm font-semibold leading-snug text-foreground', titleClamp)}>
        {item.title}
      </h3>
      <p className='mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground'>
        {item.description}
      </p>
    </Link>
  )

  const renderTimelineMarker = (item: (typeof latestChangesData)[number], isCardAbove: boolean) => (
    <div className='relative flex items-center justify-center'>
      <div className='size-3 rounded-full border border-border bg-primary' />
      <span
        className={cn(
          'absolute whitespace-nowrap text-center text-[11px] font-medium text-muted-foreground',
          isCardAbove ? 'top-[calc(100%+0.75rem)]' : 'bottom-[calc(100%+0.75rem)]'
        )}
      >
        {item.time}
      </span>
    </div>
  )

  return (
    <section id='latest-changes' className='relative'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='relative overflow-hidden border-y xl:flex'
      >
        <BlinkingGrid className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden' />

        <div className='mx-auto max-w-6xl space-y-8 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          {/* Header */}
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                Latest Changes
              </Badge>
            </MotionPreset>
            <div className='flex justify-between gap-4 max-md:flex-col'>
              <MotionPreset delay={0.3} transition={{ duration: 0.5 }} className='max-w-100'>
                <h2 className='text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                  Constantly Evolving ✨
                </h2>
              </MotionPreset>
              <MotionPreset
                delay={0.3}
                fade
                blur
                slide={{ direction: 'down', offset: 50 }}
                transition={{ duration: 0.5 }}
              >
                <p className='text-muted-foreground max-w-xl text-lg'>
                  Catch up on the latest from Atmos! We&apos;re constantly shipping shiny new features, squashing bugs, and making things faster so you can build better.
                </p>
              </MotionPreset>
            </div>
          </div>

          <MotionPreset delay={0.45} fade blur transition={{ duration: 0.6 }} className='-mx-4 sm:-mx-6 lg:-mx-8'>
            <Separator />
          </MotionPreset>

          {/* Timeline */}
          <MotionPreset delay={0.6} fade blur transition={{ duration: 0.6 }}>

            {/* ── Desktop: alternating above / below ── */}
            <div className='hidden md:block'>
              {/* Row above the line  (items 0, 2) */}
              <div className='grid grid-cols-3 gap-6'>
                {latestChangesData.map((item, index) => {
                  return (
                    <div key={`above-${item.id}`} className='flex h-full flex-col items-center justify-end'>
                      {index % 2 === 0 ? (
                        <>
                          {renderReleaseCard(item, 'line-clamp-2')}
                          {/* Connector down to dot */}
                          <div className='mt-4 h-10 w-0 border-l border-dashed border-border' />
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* Dots + horizontal line */}
              <div className='relative grid min-h-10 grid-cols-3 gap-6'>
                <div className='absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-border' />
                {latestChangesData.map((item, index) => (
                  <div key={`dot-${item.id}`} className='relative z-10 flex items-center justify-center'>
                    {renderTimelineMarker(item, index % 2 === 0)}
                  </div>
                ))}
              </div>

              {/* Row below the line  (item 1) */}
              <div className='grid grid-cols-3 gap-6'>
                {latestChangesData.map((item, index) => {
                  return (
                    <div key={`below-${item.id}`} className='flex h-full flex-col items-center'>
                      {index % 2 !== 0 ? (
                        <>
                          {/* Connector up from dot */}
                          <div className='mb-4 h-10 w-0 border-l border-dashed border-border' />
                          {renderReleaseCard(item, 'line-clamp-2')}
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Mobile: vertical list ── */}
            <div className='space-y-4 md:hidden'>
              {latestChangesData.map((item) => {
                return (
                  <Link
                    key={item.id}
                    href={{
                      pathname: '/changelog',
                      hash: item.version ? `v${item.version}` : undefined,
                    }}
                    onClick={clearCurrentHashBeforeNavigation}
                    className={cn(
                      'group rounded-2xl border bg-background p-5 transition-colors hover:bg-muted/30',
                      'outline-hidden ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                  >
                    <div className='min-w-0 space-y-1'>
                      <div className='mb-3 flex items-start justify-between gap-3'>
                        {item.version ? (
                          <p className='font-mono text-xs font-medium text-primary'>v{item.version}</p>
                        ) : (
                          <span />
                        )}
                        <ArrowUpRightIcon className='size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:rotate-45 group-hover:text-foreground' />
                      </div>
                      <p className='text-[11px] font-medium text-muted-foreground'>
                        {item.time}
                      </p>
                      <h3 className='line-clamp-1 pt-1 text-sm font-semibold text-foreground'>{item.title}</h3>
                      <p className='line-clamp-2 text-xs leading-relaxed text-muted-foreground'>{item.description}</p>
                    </div>
                  </Link>
                )
              })}
            </div>

          </MotionPreset>

          {/* Action Button */}
          <MotionPreset
            className='flex items-center justify-center gap-4'
            fade
            blur
            slide={{ direction: 'down', offset: 50 }}
            delay={1.65}
            transition={{ duration: 0.6 }}
          >
            <CraftButton asChild>
              <Link href='/changelog'>
                <CraftButtonLabel>See all releases</CraftButtonLabel>
                <CraftButtonIcon>
                  <ArrowUpRightIcon className='size-3 stroke-2 transition-transform duration-300 group-hover:rotate-45' />
                </CraftButtonIcon>
              </Link>
            </CraftButton>
          </MotionPreset>
        </div>

        <BlinkingGrid className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden' />
      </MotionPreset>
    </section>
  )
}

export default LatestChanges
