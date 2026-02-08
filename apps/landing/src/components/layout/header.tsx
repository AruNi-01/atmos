'use client'

import { useEffect, useState } from 'react'

import { Hammer } from 'lucide-react'

import Link from 'next/link'

import { Button } from '@workspace/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/ui/tooltip'

import { type Navigation } from '@/components/layout/hero-navigation'

import { cn } from '@/lib/utils'

import Logo from '@/components/logo'
import { ModeToggle } from '@/components/layout/mode-toggle'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'

type HeaderProps = {
  navigationData: Navigation[]
  className?: string
}

const Header = ({ navigationData, className }: HeaderProps) => {
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
        <Link href='/#hero' className='flex items-center gap-3'>
          <Logo animate={!isScrolled} />
        </Link>

        <div className='flex items-center gap-3'>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground mr-2 max-sm:hidden">
            <Link href="#docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <Link href="/changelog" className="transition-colors hover:text-foreground">
              Changelog
            </Link>
          </nav>

          {/* Theme Toggle */}
          <ModeToggle />
          {/* Actions */}
          <Button variant='outline' className='rounded-full px-4! max-sm:hidden' asChild>
            <Link href='#'>
              Let’s Build <Hammer className='size-4' />
            </Link>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='outline' size='icon' className='rounded-full px-4! sm:hidden' asChild>
                <Link href='#'>
                  <span className='sr-only'>Let’s Build</span>
                  <Hammer className='size-4' />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Let’s Build</TooltipContent>
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
