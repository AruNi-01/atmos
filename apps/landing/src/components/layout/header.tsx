'use client'

import { useEffect, useState, type MouseEvent } from 'react'

import { Hammer, MenuIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import Link from 'next/link'
import { Link as IntlLink } from '@atmos/i18n/navigation'

import { Button } from '@workspace/ui/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/ui/sheet'

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    setMobileMenuOpen(false)
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
        'sticky top-0 z-50 h-14 w-full border-b transition-all duration-300 sm:h-16',
        {
          'bg-card/75 backdrop-blur': isScrolled
        },
        className
      )}
    >
      <div className='relative mx-auto flex h-full max-w-6xl items-center justify-between gap-2 px-4 min-[1147px]:border-x sm:gap-4 sm:px-6 lg:px-8'>
        <motion.div
          className="absolute -left-px top-0 bottom-0 w-px bg-primary origin-bottom hidden min-[1147px]:block"
          style={{ scaleY: leftScaleY }}
        />
        <motion.div
          className="absolute -right-px top-0 bottom-0 w-px bg-primary origin-bottom hidden min-[1147px]:block"
          style={{ scaleY: rightScaleY }}
        />
        {/* Logo */}
        <IntlLink href={{ pathname: '/', hash: 'home' }} className='flex min-w-0 items-center gap-2 sm:gap-3'>
          <Logo animate={!isScrolled} />
        </IntlLink>

        <div className='flex shrink-0 items-center gap-1.5 sm:gap-3'>
          <nav className="mr-2 hidden items-center gap-4 text-sm font-medium text-muted-foreground sm:flex">
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
          {/* Desktop CTA */}
          <Button variant='outline' className='hidden rounded-full px-4! sm:inline-flex' asChild>
            <IntlLink
              href={{ pathname: '/', hash: 'ready-download' }}
              onClick={scrollToDownload}
            >
              {t('build')} <Hammer className='size-4' />
            </IntlLink>
          </Button>

          {/* Mobile menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                className='rounded-full sm:hidden'
                aria-label={t('menu')}
              >
                <MenuIcon className='size-4' />
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-[min(100vw-2rem,20rem)] gap-0 p-0'>
              <SheetHeader className='border-b px-5 py-4 text-left'>
                <SheetTitle className='text-base'>{t('menu')}</SheetTitle>
              </SheetHeader>
              <nav className='flex flex-col gap-1 p-3'>
                <SheetClose asChild>
                  <Link
                    href='https://docs.atmos.land'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted'
                  >
                    {t('docs')}
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <IntlLink
                    href='/changelog'
                    className='rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted'
                  >
                    {t('changelog')}
                  </IntlLink>
                </SheetClose>
                <SheetClose asChild>
                  <IntlLink
                    href={{ pathname: '/', hash: 'ready-download' }}
                    onClick={scrollToDownload}
                    className='mt-1 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90'
                  >
                    {t('build')}
                    <Hammer className='size-4' />
                  </IntlLink>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
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
