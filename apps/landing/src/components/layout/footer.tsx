'use client'

import { GeistPixelSquare } from 'geist/font/pixel'
import { Link } from '@atmos/i18n/navigation'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import LogoSvg from '@workspace/ui/components/logo-svg'
import { LandingFrame } from '@/components/layout/landing-frame'

const Footer = () => {
  return (
    <footer className='relative overflow-hidden'>
      <LandingFrame>
        <MotionPreset
          fade
          blur
          transition={{ duration: 0.5 }}
          delay={0.15}
          className='group w-full min-w-0 px-3 pb-6 pt-10 sm:px-4 sm:pb-4 sm:pt-12 md:px-8'
        >
          <Link
            href={{ pathname: '/', hash: 'home' }}
            className={`flex w-full min-w-0 items-center justify-between ${GeistPixelSquare.className}`}
          >
            <span className='text-[18vw] font-black uppercase leading-[0.75] tracking-tighter sm:text-[22vw] md:text-[26vw] lg:text-[16rem] xl:text-[19rem]'>
              A
            </span>
            <span className='text-[18vw] font-black uppercase leading-[0.75] tracking-tighter sm:text-[22vw] md:text-[26vw] lg:text-[16rem] xl:text-[19rem]'>
              t
            </span>
            <span className='text-[18vw] font-black uppercase leading-[0.75] tracking-tighter sm:text-[22vw] md:text-[26vw] lg:text-[16rem] xl:text-[19rem]'>
              m
            </span>
            <LogoSvg className='size-[14vw] shrink-0 transition-transform duration-1000 group-hover:rotate-90 sm:size-[18vw] md:size-[20vw] lg:size-52 xl:size-64' />
            <span className='text-[18vw] font-black uppercase leading-[0.75] tracking-tighter sm:text-[22vw] md:text-[26vw] lg:text-[16rem] xl:text-[19rem]'>
              s
            </span>
          </Link>
        </MotionPreset>
      </LandingFrame>
    </footer>
  )
}

export default Footer
