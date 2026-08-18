'use client'

import { MoonStarIcon, SunIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { useTheme } from '@/components/providers/theme-provider'
import { headerActionSurfaceClass } from '@/components/ui/header-action'
import { cn } from '@/lib/utils'

const ModeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <motion.button
      type='button'
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'relative inline-flex size-9 items-center justify-center',
        headerActionSurfaceClass
      )}
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
    >
      <MoonStarIcon className='size-4 scale-100 dark:scale-0' />
      <SunIcon className='absolute size-4 scale-0 dark:scale-100' />
      <span className='sr-only'>Toggle theme</span>
    </motion.button>
  )
}

export { ModeToggle }
