'use client'

import Link from 'next/link'
import { ArrowUpRightIcon, RocketIcon } from 'lucide-react'
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
import { Marquee } from '@workspace/ui/components/ui/marquee'
import { CraftButton, CraftButtonLabel, CraftButtonIcon } from '@workspace/ui/components/ui/craft-button'

import AtmosPreview from '@/assets/img/atmos_preview.png'

const HeroSection = () => {
  return (
    <section id='home' className='relative flex-1'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.1}
        className='mx-auto grid max-w-6xl grid-cols-1 flex-col gap-12 px-4 py-12 min-[1147px]:border-x sm:gap-16 sm:px-6 sm:py-16 md:grid-cols-2 lg:gap-24 lg:px-8 lg:py-24'
      >
        <div className='space-y-5'>
          <MotionPreset fade slide blur transition={{ duration: 0.5 }}>
            <Badge className='px-2.5 py-1 shadow-sm' variant='outline'>
              <span className='relative flex size-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-green-600 opacity-75 dark:bg-green-400'></span>
                <span className='relative inline-flex size-2 rounded-full bg-green-600 dark:bg-green-400'></span>
              </span>
              Visual Terminal Workspace | v1.0
            </Badge>
          </MotionPreset>

          <MotionPreset fade blur transition={{ duration: 0.9 }} delay={0.2}>
            <div className='flex flex-col gap-2 text-2xl font-bold sm:text-3xl lg:text-5xl'>
              <div className='flex items-center gap-2.25'>
                <MotionPreset
                  slide={{ direction: 'left', offset: 40 }}
                  blur='6px'
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  delay={0.8}
                  motionProps={{
                    initial: { rotate: -5, opacity: 0.7 },
                    animate: { rotate: 0, opacity: 0.7 }
                  }}
                >
                  <span className='text-muted-foreground'>Your</span>
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
                    <span className='flex size-10 shrink-0 rotate-10 items-center justify-center rounded-[7px] bg-sky-600/20 dark:bg-sky-400/20'>
                      <RocketIcon className='size-6 text-sky-600 dark:text-sky-400' />
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
                  <span>Personal</span>
                </MotionPreset>
              </div>
              <div className='flex items-center gap-2.25'>
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
                  <span>Productivity</span>
                </MotionPreset>
              </div>
              <div className='flex items-center gap-2.25'>
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
                  <span>Habitat</span>
                </MotionPreset>

                <MotionPreset
                  zoom={{ initialScale: 0.5, scale: 1 }}
                  blur='10px'
                  transition={{
                    duration: 0.9,
                    ease: [0.34, 1.56, 0.64, 1]
                  }}
                  delay={1.8}
                  motionProps={{
                    initial: { rotate: -5, opacity: 0.7 },
                    animate: { rotate: 0, opacity: 0.7 },
                    whileHover: { scale: 1.05 }
                  }}
                >
                  <span className='text-muted-foreground'>.</span>
                </MotionPreset>
              </div>
            </div>
          </MotionPreset>

          {/* Para */}
          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.5}>
            <p className='text-muted-foreground text-lg'>
              Build, create, and thrive in your <span className='text-foreground'>personal productivity habitat</span>.
              An open-source platform for developers.
            </p>
          </MotionPreset>

          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.7}>
            <div className="flex gap-4">
              <CraftButton asChild>
                <Link href='#'>
                  <CraftButtonLabel>Get Started</CraftButtonLabel>
                  <CraftButtonIcon>
                    <ArrowUpRightIcon className='size-3 stroke-2 transition-transform duration-500 group-hover:rotate-45' />
                  </CraftButtonIcon>
                </Link>
              </CraftButton>
              <Button variant='outline' className='rounded-full px-6' asChild>
                <Link href='https://github.com/atmos-org/atmos' target="_blank">
                  View on GitHub
                </Link>
              </Button>
            </div>
          </MotionPreset>
        </div>

        {/* Right side: Preview Image */}
        <div className='flex items-center justify-center max-md:hidden'>
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
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='relative flex border-y max-[1196px]:mx-auto max-[1196px]:max-w-6xl'
      >
        <div className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden'></div>

        <div className='bg-background flex max-w-6xl grow gap-2.5 px-4 py-2.5 max-md:flex-col min-[1147px]:border-x sm:px-6 lg:px-8'>
          <MotionPreset
            fade
            slide
            blur
            transition={{ duration: 0.5 }}
            delay={0.6}
            className='flex shrink-0 items-center gap-1.75 max-md:justify-center max-sm:flex-col max-sm:text-center'
          >
            <div>
              <p className='text-lg font-medium text-nowrap'>Build with any agent</p>
            </div>
          </MotionPreset>
          <MotionPreset fade blur delay={0.7} transition={{ duration: 0.5 }} className='relative overflow-hidden w-full'>
            <div className='from-background pointer-events-none absolute inset-y-0 left-0 z-1 w-10 bg-linear-to-r via-85% to-transparent' />
            <div className='from-background pointer-events-none absolute inset-y-0 right-0 z-1 w-10 bg-linear-to-l via-85% to-transparent' />
            <Marquee pauseOnHover duration={30} gap={8} className='*:items-center'>
              <div className='flex items-center gap-2'>
                <span className="text-xl">🤖</span>
                <span className='text-lg font-semibold opacity-70'>Claude Code</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">👾</span>
                <span className='text-lg font-semibold opacity-70'>Codex</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">⚡</span>
                <span className='text-lg font-semibold opacity-70'>Amp</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">🔋</span>
                <span className='text-lg font-semibold opacity-70'>Droid</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">⚖️</span>
                <span className='text-lg font-semibold opacity-70'>Kilo</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">🧠</span>
                <span className='text-lg font-semibold opacity-70'>OpenCode</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className="text-xl">💎</span>
                <span className='text-lg font-semibold opacity-70'>Gemini</span>
              </div>
            </Marquee>
          </MotionPreset>
        </div>
        <div className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden'></div>
      </MotionPreset>
    </section>
  )
}

export default HeroSection
