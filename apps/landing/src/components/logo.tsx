'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { TextScramble } from '@workspace/ui/components/ui/text-scramble'

const AnimatedLogoSvg = ({ className, animate = true }: { className?: string; animate?: boolean }) => {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' className="w-full h-full overflow-visible">
        {/* Inner Circle - Core */}
        <motion.circle
          cx='16' cy='16' r='6'
          stroke='currentColor'
          strokeWidth='2.5'
          initial={{ scale: 0.8, opacity: 0.8 }}
          animate={animate ? {
            scale: [0.8, 1.1, 0.8, 0.8],
            opacity: [0.8, 1, 0.8, 0.8]
          } : { scale: 0.8, opacity: 0.8 }}
          transition={animate ? {
            duration: 6,
            times: [0, 0.2, 0.5, 1],
            repeat: Infinity,
            ease: "easeInOut"
          } : { duration: 0.5, ease: "easeInOut" }}
        />

        {/* Middle Circle - Orbit 1 */}
        <motion.circle
          cx='16' cy='16' r='10'
          stroke='currentColor'
          strokeWidth='1.5'
          opacity='0.6'
          initial={{ rotate: 0, scale: 1 }}
          animate={animate ? {
            rotate: [0, 360, 360],
            scale: [1, 1.1, 1, 1]
          } : { rotate: 360, scale: 1 }}
          transition={animate ? {
            duration: 6,
            times: [0, 0.5, 1],
            scale: {
              times: [0, 0.25, 0.5, 1],
              duration: 6,
              repeat: Infinity
            },
            repeat: Infinity,
            ease: "easeInOut"
          } : { duration: 1, ease: "easeInOut" }}
          style={{ originX: "16px", originY: "16px" }}
        />

        {/* Outer Circle - Orbit 2 */}
        <motion.circle
          cx='16' cy='16' r='14'
          stroke='currentColor'
          strokeWidth='0.5'
          opacity='0.3'
          strokeDasharray="4 4"
          initial={{ rotate: 0 }}
          animate={animate ? {
            rotate: [0, -360, -360]
          } : { rotate: -360 }}
          transition={animate ? {
            duration: 6,
            times: [0, 0.5, 1],
            repeat: Infinity,
            ease: "easeInOut"
          } : { duration: 1, ease: "easeInOut" }}
          style={{ originX: "16px", originY: "16px" }}
        />
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
      <AnimatedLogoSvg className='size-8.5 text-primary' animate={animate} />
      <div className='relative whitespace-nowrap'>
        <TextScramble
          as="span"
          className='text-primary text-[20px] font-medium uppercase select-none inline-block tabular-nums tracking-widest cursor-default min-w-[5ch]'
          trigger={isHovered}
          characterSet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        >
          ATMOS
        </TextScramble>
      </div>
    </div>
  )
}

export default Logo
