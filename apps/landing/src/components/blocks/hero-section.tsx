'use client'

import { GeistPixelSquare } from 'geist/font/pixel'
import { ArrowRightIcon, RocketIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { CraftButton, CraftButtonLabel, CraftButtonIcon } from '@workspace/ui/components/ui/craft-button'

import TerminalAgentGrid from '@/assets/img/terminal-agent-grid.png'
import { LandingFrame } from '@/components/layout/landing-frame'
import AgentShow from './agent-show'

const HeroSection = () => {
  const t = useTranslations('hero')

  return (
    <section id='home' className='relative flex-1 overflow-x-clip'>
      <LandingFrame contentClassName='overflow-visible'>
        <MotionPreset
          fade
          blur
          transition={{ duration: 0.5 }}
          delay={0.1}
          className='flex w-full min-w-0 flex-col gap-8 py-10 sm:gap-12 sm:py-16 lg:gap-14 lg:py-24'
        >
          <div className='flex w-full min-w-0 flex-col justify-between space-y-5 px-4 sm:flex-row sm:items-end sm:space-y-0 sm:px-6 lg:px-8'>
            <MotionPreset fade blur transition={{ duration: 0.9 }} delay={0.2}>
              <div className={`flex w-full min-w-0 flex-col gap-2 text-3xl font-bold tracking-tight sm:gap-3 sm:text-4xl md:gap-4 md:text-5xl lg:text-7xl ${GeistPixelSquare.className}`}>
                <div className='flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4'>
                  <MotionPreset
                    slide={{ direction: 'left', offset: 40 }}
                    blur='6px'
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    delay={0.8}
                    motionProps={{
                      initial: { rotate: -5, opacity: 0.7 },
                      animate: { rotate: 0, opacity: 1 }
                    }}
                  >
                    <span>{t('line1Primary')}</span>
                  </MotionPreset>
                  <MotionPreset
                    zoom={{ initialScale: 0.3, scale: 1 }}
                    blur='10px'
                    transition={{ type: 'spring', stiffness: 250, damping: 18 }}
                    delay={1}
                    motionProps={{
                      initial: { rotate: 30 },
                      animate: { rotate: 0 },
                      whileHover: { scale: 1.1, rotate: 5 }
                    }}
                  >
                    <div className='relative flex'>
                      <span className='flex size-8 shrink-0 rotate-10 items-center justify-center rounded-[10px] bg-sky-600/20 sm:size-10 md:size-14 dark:bg-sky-400/20'>
                        <RocketIcon className='size-5 text-sky-600 sm:size-6 md:size-8 dark:text-sky-400' />
                      </span>
                    </div>
                  </MotionPreset>
                  <MotionPreset
                    zoom={{ initialScale: 0.8, scale: 1 }}
                    blur='6px'
                    transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
                    delay={1.15}
                    motionProps={{
                      initial: { rotate: 3 },
                      animate: { rotate: 0 }
                    }}
                  >
                    <span className='text-muted-foreground'>{t('line1Secondary')}</span>
                  </MotionPreset>
                </div>
                <div className='relative flex w-full flex-wrap items-end gap-2 sm:gap-3 md:gap-4'>
                  <MotionPreset
                    slide={{ direction: 'up', offset: 35 }}
                    blur='6px'
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    delay={1.25}
                    motionProps={{
                      initial: { rotate: -2 },
                      animate: { rotate: 0 }
                    }}
                  >
                    <span>{t('line2Primary')}</span>
                  </MotionPreset>
                  <MotionPreset
                    slide={{ direction: 'right', offset: 40 }}
                    blur='6px'
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    delay={1.5}
                    motionProps={{
                      initial: { rotate: 4 },
                      animate: { rotate: 0 }
                    }}
                  >
                    <span>{t('line2Secondary')}</span>
                  </MotionPreset>
                </div>
              </div>
            </MotionPreset>

            <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={1.7} className="shrink-0">
              <div className="flex">
                <CraftButton className="h-11 rounded-full px-4 shadow-lg sm:h-12 sm:px-5 md:h-14 md:px-6 lg:px-8" asChild>
                  <Link
                    href='#ready-download'
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById('ready-download') || document.getElementById('download');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <CraftButtonLabel className="font-sans text-base font-medium tracking-normal sm:text-lg md:text-xl lg:text-2xl">{t('cta')}</CraftButtonLabel>
                    <CraftButtonIcon>
                      <ArrowRightIcon className='size-4 rotate-45 stroke-2 transition-transform duration-300 group-hover:rotate-90 md:size-5 lg:size-6' />
                    </CraftButtonIcon>
                  </Link>
                </CraftButton>
              </div>
            </MotionPreset>
          </div>

          {/*
            Hero cover breaks slightly past the vertical rails for impact.
            Width: content + ~2.5–4rem each side; height forced taller via min-h + object-cover.
          */}
          <MotionPreset
            fade
            zoom
            blur
            transition={{ duration: 1, delay: 0.5 }}
            className='relative z-10 w-full'
          >
            <div className='relative left-1/2 w-[min(100vw,calc(100%+3.5rem))] -translate-x-1/2 sm:w-[min(100vw,calc(100%+5.5rem))] md:w-[min(100vw,calc(100%+7rem))]'>
              <div className='overflow-hidden rounded-lg border bg-muted shadow-2xl shadow-black/20 ring-1 ring-black/5 sm:rounded-xl dark:shadow-black/40 dark:ring-white/10'>
                <Image
                  src={TerminalAgentGrid}
                  alt={t('previewAlt')}
                  priority
                  className='h-[min(62vw,28rem)] w-full object-cover object-top sm:h-[min(56vw,36rem)] md:h-[min(50vw,42rem)] lg:h-[min(46vw,48rem)]'
                  sizes='(max-width: 768px) 100vw, (max-width: 1280px) 100vw, 1280px'
                />
              </div>
            </div>
          </MotionPreset>
        </MotionPreset>
      </LandingFrame>
      <AgentShow />
    </section>
  )
}

export default HeroSection
