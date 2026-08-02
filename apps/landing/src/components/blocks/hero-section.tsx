'use client'

import { GeistPixelSquare } from 'geist/font/pixel'
import { ArrowRightIcon, RocketIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { HeroVideoDialog } from '@/components/ui/hero-video-dialog'
import { CraftButton, CraftButtonLabel, CraftButtonIcon } from '@workspace/ui/components/ui/craft-button'

import TerminalAgentGrid from '@/assets/img/terminal-agent-grid.png'
import AgentShow from './agent-show'

const HeroSection = () => {
  const t = useTranslations('hero')

  return (
    <section id='home' className='relative flex-1'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.1}
        className='mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 py-10 min-[1147px]:border-x sm:gap-16 sm:px-6 sm:py-20 lg:gap-20 lg:px-8 lg:py-28'
      >
        <div className='flex w-full min-w-0 flex-col justify-between space-y-5 sm:flex-row sm:items-end sm:space-y-0'>
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

        {/* Bottom side: Preview Image */}
        <div className='flex w-full items-center justify-center sm:pt-4'>
          <MotionPreset
            fade
            zoom
            blur
            transition={{ duration: 1, delay: 0.5 }}
            className='relative flex items-center justify-center w-full'
          >
            <HeroVideoDialog
              className="w-full"
              animationStyle="from-center"
              videoSrc="/videos/agent-terminal-use-flow.mp4"
              thumbnailSrc={TerminalAgentGrid.src}
              thumbnailAlt={t('previewAlt')}
            />
          </MotionPreset>
        </div>
      </MotionPreset>
      <AgentShow />
    </section>
  )
}

export default HeroSection
