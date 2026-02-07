'use client'

import { MoonStarIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@workspace/ui/components/ui/button'

const ModeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant='outline'
      size='icon'
      className='relative rounded-full'
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
    >
      <MoonStarIcon className='scale-100 dark:scale-0' />
      <SunIcon className='absolute scale-0 dark:scale-100' />
      <span className='sr-only'>Toggle theme</span>
    </Button>
  )
}

export { ModeToggle }
