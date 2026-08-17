'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TextScramble } from '@workspace/ui/components/ui/text-scramble'
import LogoSvg from '@workspace/ui/components/logo-svg'

const Logo = ({ className }: { className?: string }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn('group flex items-center gap-3', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <LogoSvg className='h-6 w-auto text-primary cursor-default' />
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
