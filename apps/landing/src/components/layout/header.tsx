'use client'

import { useEffect, useState, type MouseEvent } from 'react'

import { Hammer } from 'lucide-react'
import { useTranslations } from 'next-intl'

import Link from 'next/link'
import { Link as IntlLink } from '@atmos/i18n/navigation'

import { Button } from '@workspace/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/ui/tooltip'

import { cn } from '@/lib/utils'

import Logo from '@/components/logo'
import { ModeToggle } from '@/components/layout/mode-toggle'
import { LocaleSwitcher } from '@/components/locale-switcher'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'

type HeaderProps = {
  className?: string
}

const Header = ({ className }: HeaderProps) => {
  const t = useTranslations('header')
  const [isScrolled, setIsScrolled] = useState(false)
  const [windowWidth, setWindowWidth] = useState(0)

  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  // Calculate triggers for vertical bars based on screen width
  const containerWidth = 1152 // max-w-6xl
  const boxWidth = Math.min(windowWidth, containerWidth)
  const leftEdge = (windowWidth - boxWidth) / 2
  const rightEdge = windowWidth - leftEdge

  const leftTrigger = windowWidth > 0 ? leftEdge / windowWidth : 0
  const rightTrigger = windowWidth > 0 ? rightEdge / windowWidth : 1

  const leftScaleY = useTransform(scaleX, [leftTrigger, leftTrigger + 0.05], [0, 1])
  const rightScaleY = useTransform(scaleX, [rightTrigger, rightTrigger + 0.05], [0, 1])

  const scrollToDownload = (event: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById('ready-download') || document.getElementById('download')
    if (!el) return

    event.preventDefault()
    el.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0)
    }

    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    // Initial measurement
    handleResize()

    window.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <MotionPreset
      fade
      blur
      transition={{ duration: 0.5 }}
      delay={0.05}
      component='header'
      className={cn(
        'sticky top-0 z-50 h-16 w-full border-b transition-all duration-300',
        {
          'bg-card/75 backdrop-blur': isScrolled
        },
        className
      )}
    >
      <div className='relative mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 min-[1147px]:border-x sm:px-6 lg:px-8'>
        <motion.div
          className="absolute -left-px top-0 bottom-0 w-px bg-primary origin-bottom hidden min-[1147px]:block"
          style={{ scaleY: leftScaleY }}
        />
        <motion.div
          className="absolute -right-px top-0 bottom-0 w-px bg-primary origin-bottom hidden min-[1147px]:block"
          style={{ scaleY: rightScaleY }}
        />
        {/* Logo */}
        <IntlLink href={{ pathname: '/', hash: 'home' }} className='flex items-center gap-3'>
          <Logo animate={!isScrolled} />
        </IntlLink>

        <div className='flex items-center gap-3'>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground mr-2 max-sm:hidden">
            <Link href="https://docs.atmos.land" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
              {t('docs')}
            </Link>
            <IntlLink href="/changelog" className="transition-colors hover:text-foreground">
              {t('changelog')}
            </IntlLink>
          </nav>

          <LocaleSwitcher />
          {/* Theme Toggle */}
          <ModeToggle />
          {/* Actions */}
          <Button variant='outline' className='rounded-full px-4! max-sm:hidden' asChild>
            <IntlLink
              href={{ pathname: '/', hash: 'ready-download' }}
              onClick={scrollToDownload}
            >
              {t('build')} <Hammer className='size-4' />
            </IntlLink>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='outline' size='icon' className='rounded-full px-4! sm:hidden' asChild>
                <IntlLink
                  href={{ pathname: '/', hash: 'ready-download' }}
                  onClick={scrollToDownload}
                >
                  <span className='sr-only'>{t('build')}</span>
                  <Hammer className='size-4' />
                </IntlLink>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('build')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <motion.div
        className="absolute -bottom-px left-0 right-0 h-px bg-primary origin-left"
        style={{ scaleX }}
      />
    </MotionPreset>
  )
}

export default Header
