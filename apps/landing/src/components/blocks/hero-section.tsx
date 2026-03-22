'use client'

import Link from 'next/link'
import { GeistPixelSquare } from 'geist/font/pixel'
import { ArrowRightIcon, RocketIcon } from 'lucide-react'
import { Button } from '@workspace/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription
} from '@workspace/ui/components/ui/dialog'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'

import Image from 'next/image'
import { Badge } from '@workspace/ui/components/ui/badge'
import { CraftButton, CraftButtonLabel, CraftButtonIcon } from '@workspace/ui/components/ui/craft-button'

import AtmosPreview from '@/assets/img/atmos_preview.png'
import AgentShow from './agent-show'

const HeroSection = () => {
  return (
    <section id='home' className='relative flex-1'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.1}
        className='mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 min-[1147px]:border-x sm:gap-16 sm:px-6 sm:py-20 lg:gap-20 lg:px-8 lg:py-28'
      >
        <div className='flex flex-col space-y-6 sm:space-y-8 w-full max-w-4xl'>
          <MotionPreset fade blur transition={{ duration: 0.9 }} delay={0.2}>
            <div className={`flex flex-col gap-3 md:gap-4 text-4xl font-bold md:text-5xl lg:text-7xl tracking-tight ${GeistPixelSquare.className}`}>
              <div className='flex items-center gap-3 sm:gap-4 flex-wrap'>
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
                  <span>Atmosphere</span>
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
                    <span className='flex size-10 md:size-14 shrink-0 rotate-10 items-center justify-center rounded-[10px] bg-sky-600/20 dark:bg-sky-400/20'>
                      <RocketIcon className='size-6 md:size-8 text-sky-600 dark:text-sky-400' />
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
                  <span className='text-muted-foreground'>for</span>
                </MotionPreset>
              </div>
              <div className='flex items-end w-full gap-3 sm:gap-4 flex-wrap relative'>
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
                  <span>Agentic</span>
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
                  <span>Builders</span>
                </MotionPreset>
                
                <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={1.7} className="ml-auto flex items-end mb-1 md:mb-2 lg:mb-3">
                  <div className="flex">
                    <CraftButton className="rounded-full shadow-lg" asChild>
                      <Link 
                        href='#ready-download'
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById('ready-download') || document.getElementById('download');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        <CraftButtonLabel className="font-sans text-base md:text-lg font-medium tracking-normal">Get Started</CraftButtonLabel>
                        <CraftButtonIcon>
                          <ArrowRightIcon className='size-4 md:size-5 stroke-2 rotate-45 transition-transform duration-300 group-hover:rotate-90' />
                        </CraftButtonIcon>
                      </Link>
                    </CraftButton>
                  </div>
                </MotionPreset>
              </div>
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
            <Dialog>
              <DialogTrigger asChild>
                <div className='relative w-full cursor-pointer group'>
                  <div className='absolute inset-0  rounded-full opacity-50 transition-opacity duration-300 group-hover:opacity-80' />
                  <Image
                    src={AtmosPreview}
                    alt='Atmos Visual Terminal Preview'
                    className='relative w-full h-auto rounded-lg border border-border/50 transition-transform duration-300 group-hover:scale-[1.02]'
                    priority
                  />
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[90vw] max-w-[95vw] w-auto p-0 overflow-hidden bg-transparent border-none shadow-none">
                <DialogTitle className="sr-only">Atmos Visual Terminal Preview</DialogTitle>
                <DialogDescription className="sr-only">Full size preview of the Atmos interface</DialogDescription>
                <div className="relative w-full h-auto flex items-center justify-center">
                  <Image
                    src={AtmosPreview}
                    alt='Atmos Visual Terminal Preview'
                    className='max-w-[90vw] max-h-[90vh] w-auto h-auto rounded-lg'
                    priority
                  />
                </div>
              </DialogContent>
            </Dialog>
          </MotionPreset>
        </div>
      </MotionPreset>
      <AgentShow />
    </section>
  )
}

export default HeroSection
