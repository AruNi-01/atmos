'use client'

import { useState, type MouseEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Star } from 'lucide-react'
import { Github } from '@workspace/ui/components/icons/lucide-brand-icons'

import { cn } from '@/lib/utils'
import { headerActionSurfaceClass } from '@/components/ui/header-action'

type GitHubStarButtonProps = {
  href: string
  label: string
  className?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

function Sparkle({
  className,
  delay,
}: {
  className: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, rotate: -45, y: 10 }}
      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
      exit={{ opacity: 0, scale: 0, rotate: 45, y: 10 }}
      transition={{ type: 'spring', stiffness: 600, damping: 25, delay }}
      className={className}
    >
      <svg className='size-full' viewBox='0 0 24 24' fill='currentColor' aria-hidden>
        <path d='M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z' />
      </svg>
    </motion.div>
  )
}

// Adapted from Amicro btn-2 (Star on GitHub sparkle). MIT © 2026 SYED SUBHAN UDDIN
// https://github.com/Subhan-code/Amicro--Micro-transitions-
export function GitHubStarButton({ href, label, className, onClick }: GitHubStarButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  const handleEnter = () => setIsHovered(true)
  const handleLeave = () => setIsHovered(false)
  const handleTouchEnd = () => {
    window.setTimeout(() => setIsHovered(false), 500)
  }
  const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === 'touch') handleEnter()
  }

  return (
    <motion.a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onPointerMove={handlePointerMove}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onTouchStart={handleEnter}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
      animate={{
        paddingLeft: isHovered ? 28 : 24,
        paddingRight: isHovered ? 28 : 24,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'relative inline-flex h-9 min-w-[75px] items-center justify-center no-underline',
        headerActionSurfaceClass,
        className
      )}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className='flex w-full items-center justify-center'
      >
        <div className='relative flex size-4 shrink-0 items-center justify-center'>
          <AnimatePresence mode='popLayout' initial={false}>
            {!isHovered ? (
              <motion.div
                key='github'
                initial={{ y: -15, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -15, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                className='absolute inset-0 flex items-center justify-center'
              >
                <Github className='size-4' />
              </motion.div>
            ) : (
              <motion.div
                key='star'
                initial={{ y: 15, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 15, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                className='absolute inset-0 flex items-center justify-center'
              >
                <Star className='size-4 text-yellow-400' />
                <Sparkle className='absolute -top-3 -right-2 size-2.5 text-yellow-200' delay={0.05} />
                <Sparkle className='absolute -top-1 -left-3 size-1.5 text-yellow-400' delay={0.1} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <motion.span layout className='ml-2.5 text-[13px] font-medium tracking-tight whitespace-nowrap'>
          {label}
        </motion.span>
      </motion.div>
    </motion.a>
  )
}
