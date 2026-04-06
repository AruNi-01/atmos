'use client'

import { useLocale } from 'next-intl'
import { HistoryIcon, ArrowUpRightIcon, ZapIcon, StarIcon, WrenchIcon } from 'lucide-react'
import { Link } from '@atmos/i18n/navigation'

import { Badge } from '@workspace/ui/components/ui/badge'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/ui/card'
import { Separator } from '@workspace/ui/components/ui/separator'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { CraftButton, CraftButtonIcon, CraftButtonLabel } from '@workspace/ui/components/ui/craft-button'
import { BlinkingGrid } from '@/components/ui/blinking-grid'
import { changelogData } from '@/lib/changelog-data'
import { formatDate } from '@/lib/utils'

const icons = [ZapIcon, WrenchIcon, StarIcon]

const LatestChanges = () => {
  const locale = useLocale()
  const language = locale === 'zh' ? 'zh' : 'en'
  const latestChangesData = changelogData.slice(0, 3).map((item, index) => ({
    id: item.id,
    title: `v${item.version} - ${item.title[language]}`,
    description: item.description[language].replace(/\*\*|\*/g, ''),
    time: formatDate(new Date(item.date), language),
    href: `/changelog#v${item.version}`,
    icon: icons[index] ?? ZapIcon
  }))

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

          {/* Grid */}
          <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
            {latestChangesData.map((change, index) => {
              return (
              <MotionPreset
                key={change.id}
                fade
                blur
                slide={{ offset: 50, direction: index % 2 === 0 ? 'left' : 'right' }}
                delay={0.8 + (index * 0.2)}
                transition={{ duration: 0.6 }}
              >
                <Link href={change.href} className='block h-full outline-hidden ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-3xl'>
                  <Card className={`rounded-3xl border shadow-xs h-full transition-colors hover:bg-muted/50`}>
                    <CardHeader className='gap-3'>
                      <div className='flex justify-between items-start'>
                        <CardTitle className='flex flex-col gap-2.5 text-xl font-semibold'>
                          <change.icon className='size-5 text-primary' />
                          <span className="text-lg">{change.title}</span>
                        </CardTitle>
                      </div>
                      <CardDescription className='flex items-center gap-1.5 text-xs font-mono text-muted-foreground font-medium'>
                        <HistoryIcon className='size-3.5' /> {change.time}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className='text-muted-foreground text-[15px] leading-relaxed'>{change.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              </MotionPreset>
            )})}
          </div>



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
