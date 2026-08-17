'use client'

import { GeistPixelSquare } from 'geist/font/pixel'
import { Link } from '@atmos/i18n/navigation'

import LogoSvg from '@workspace/ui/components/logo-svg'
import { LandingFrame } from '@/components/layout/landing-frame'

/**
 * Pixel-font ATMOS + landscape mark is ~4.0em wide (letters are narrower
 * than 1em). Size to the 72rem rail box with 1rem inset each side.
 */
const FONT_SIZE = 'calc((min(100vw, 72rem) - 2rem) / 4.02)'

const Footer = () => {
  return (
    <footer className='relative'>
      <LandingFrame>
        <div className='flex w-full justify-center'>
          <Link
            href={{ pathname: '/', hash: 'home' }}
            className={`flex items-center gap-[0.08em] font-black uppercase leading-none tracking-tighter ${GeistPixelSquare.className}`}
            style={{ fontSize: FONT_SIZE }}
          >
            <span>A</span>
            <span>t</span>
            <span>m</span>
            <LogoSvg className='h-[0.72em] w-auto shrink-0' />
            <span>s</span>
          </Link>
        </div>
      </LandingFrame>
    </footer>
  )
}

export default Footer
