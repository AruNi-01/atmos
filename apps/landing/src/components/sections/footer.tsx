'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GithubIcon, InstagramIcon, MessageSquareText, TwitterIcon, YoutubeIcon } from 'lucide-react'

import { Separator } from '@workspace/ui/components/ui/separator'
import { CraftButton, CraftButtonLabel, CraftButtonIcon } from '@workspace/ui/components/ui/craft-button'
import LogoSvg from '@/assets/svg/logo-svg'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'

const Footer = () => {
  const pathname = usePathname()
  const isContactPage = pathname === '/contact-me'

  return (
    <footer className='relative'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='mx-auto flex max-w-6xl justify-center border-x px-8 py-7'
      >
        <Link href='/#hero' className='flex flex-col items-center gap-3'>
          <LogoSvg className='size-12.5' />
          <span className='text-xl font-semibold uppercase'>Atmos</span>
        </Link>
      </MotionPreset>

      <MotionPreset delay={0.16} fade blur transition={{ duration: 0.6 }}>
        <Separator />
      </MotionPreset>

      {!isContactPage && (
        <>
          <MotionPreset
            fade
            blur
            transition={{ duration: 0.5 }}
            delay={0.15}
            className='mx-auto flex max-w-6xl flex-col items-center gap-6 border-x px-8 py-7'
          >
            <h2 className='max-w-89 text-center text-2xl font-semibold md:text-3xl lg:text-4xl'>
              Let&apos;s collaborate and craft your vision
            </h2>

            <CraftButton asChild>
              <Link href='/contact-me'>
                <CraftButtonLabel>Let&apos;s talk</CraftButtonLabel>
                <CraftButtonIcon>
                  <MessageSquareText className='size-3' />
                </CraftButtonIcon>
              </Link>
            </CraftButton>
          </MotionPreset>

          <MotionPreset delay={0.16} fade blur transition={{ duration: 0.6 }}>
            <Separator />
          </MotionPreset>
        </>
      )}

      <MotionPreset delay={0.16} fade blur transition={{ duration: 0.6 }}>
        <Separator />
      </MotionPreset>

      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='mx-auto flex max-w-6xl items-center justify-center gap-4 border-x px-8 py-7'
      >
        <Link href='#' target='_blank' aria-label='GitHub'>
          <GithubIcon className='size-5' />
        </Link>
        <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
        <Link href='#' target='_blank' aria-label='Instagram'>
          <InstagramIcon className='size-5 text-sky-600 dark:text-sky-400' />
        </Link>
        <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
        <Link href='#' target='_blank' aria-label='Twitter'>
          <TwitterIcon className='size-5 text-amber-600 dark:text-amber-400' />
        </Link>
        <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
        <Link href='#' target='_blank' aria-label='YouTube'>
          <YoutubeIcon className='text-destructive size-5' />
        </Link>
      </MotionPreset>
    </footer>
  )
}

export default Footer
