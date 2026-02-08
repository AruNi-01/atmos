'use client'

import Link from 'next/link'
import LogoSvg from '@/assets/svg/logo-svg'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'

const Footer = () => {
  return (
    <footer className='relative overflow-hidden'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='group mx-auto max-w-6xl border-x px-4 pb-4 pt-12 md:px-8'
      >
        <Link
          href='/#hero'
          className='flex w-full items-center justify-between'
        >
          <span className='text-[26vw] font-black uppercase leading-[0.75] tracking-tighter lg:text-[16rem] xl:text-[19rem]'>
            A
          </span>
          <span className='text-[26vw] font-black uppercase leading-[0.75] tracking-tighter lg:text-[16rem] xl:text-[19rem]'>
            t
          </span>
          <span className='text-[26vw] font-black uppercase leading-[0.75] tracking-tighter lg:text-[16rem] xl:text-[19rem]'>
            m
          </span>
          <LogoSvg className='size-[20vw] shrink-0 transition-transform duration-1000 group-hover:rotate-90 lg:size-52 xl:size-64' />
          <span className='text-[26vw] font-black uppercase leading-[0.75] tracking-tighter lg:text-[16rem] xl:text-[19rem]'>
            s
          </span>
        </Link>
      </MotionPreset>
    </footer>
  )
}

export default Footer
