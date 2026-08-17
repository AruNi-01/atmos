'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { TextScramble } from '@workspace/ui/components/ui/text-scramble'

const RING_D =
  'M11.096 15.767a3.973 19.587 0 1 0 7.946 0a3.973 19.587 0 1 0-7.946 0zM11.582 15.767a3.487 17.193 0 1 0 6.974 0a3.487 17.193 0 1 0-6.974 0z'

const AnimatedLogoSvg = ({ className, animate = true }: { className?: string; animate?: boolean }) => {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' className="h-full w-full overflow-visible">
        <g fill='currentColor'>
          <path d='M0 16Q16 14.6 32 16Q16 17.4 0 16Z' />
          <circle cx='16' cy='16' r='7.215' />
          <motion.g
            animate={animate ? { rotate: 360 } : { rotate: 0 }}
            transition={animate ? { duration: 28, repeat: Infinity, ease: 'linear' } : { duration: 0.5, ease: 'easeInOut' }}
            style={{ originX: '16px', originY: '16px' }}
          >
            <g transform='rotate(51 15.069 15.767)'>
              <path fillRule='evenodd' d={RING_D} />
            </g>
          </motion.g>
        </g>
      </svg>
    </div>
  )
}

const Logo = ({ className, animate = true }: { className?: string; animate?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn('group flex items-center gap-3', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatedLogoSvg className='size-8.5 text-primary cursor-default' animate={animate} />
      <div className='relative whitespace-nowrap pl-1'>
        <TextScramble
          className='text-primary text-xl font-bold uppercase select-none inline-block tabular-nums tracking-widest cursor-default min-w-[5ch]'
          trigger={isHovered}
        >
          ATMOS
        </TextScramble>
      </div>
    </div>
  )
}

export default Logo
