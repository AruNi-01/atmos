'use client'

import { useRef, useState, useEffect } from 'react'
import { EyeIcon } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@workspace/ui/components/ui/badge'
import { Button } from '@workspace/ui/components/ui/button'
import { Separator } from '@workspace/ui/components/ui/separator'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'

import { cn } from '@/lib/utils'

const Portfolio = () => {
  return (
    <section id='portfolio' className='relative flex-1'>
      <MotionPreset
        className='mx-auto flex w-full max-w-6xl flex-col min-[1147px]:border-x'
      >
        {/* Header */}
        <div className='space-y-2.5 px-4 py-16 md:px-6 lg:px-8'>
          <MotionPreset>
            <Badge variant='outline' className='rounded-none'>
              Features
            </Badge>
          </MotionPreset>

          <div className='flex justify-between gap-4 max-md:flex-col'>
            <h2 className='max-w-100 text-2xl font-semibold sm:text-3xl lg:text-4xl'>
              <MotionPreset>
                Built for Developer
              </MotionPreset>
              <MotionPreset>
                Flow State ⚡
              </MotionPreset>
            </h2>

            <MotionPreset>
              <p className='text-muted-foreground max-w-xl text-lg'>
                Optimize your workflow with a terminal that understands your needs. Seamlessly switch between projects, run agents, and manage code reviews without losing context.
              </p>
            </MotionPreset>
          </div>
        </div>

        <MotionPreset>
          <Separator />
        </MotionPreset>

        <div
          className='relative grid gap-x-12.5 gap-y-16 px-4 py-16 max-sm:gap-y-8 sm:grid-cols-2 md:px-6 lg:px-8'
        >
          {/* Feature 1 */}
          <div className='group relative flex flex-col gap-6'>
            <div className='lg:h-93.5'>
              <div className={cn('overflow-hidden rounded-[12px] border shadow-sm group-hover:rotate-3 bg-muted transition-all duration-300')}>
                <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-zinc-900/5 dark:bg-zinc-50/5">
                  <div className="text-6xl mb-4">📂</div>
                  <h3 className="text-xl font-medium">Workspace Management</h3>
                  <p className="mt-2 text-sm opacity-70">Manage multiple projects and git worktrees simultaneously.</p>
                </div>
              </div>
            </div>

            <div className='-z-1 flex items-center justify-between gap-4 md:gap-6'>
              <div className='flex flex-col gap-2.5'>
                <span className='text-2xl font-semibold'>Project Spaces</span>
                <span className='text-muted-foreground text-lg'>Multi-repo & Worktree support</span>
              </div>

              <Button
                variant='outline'
                className='group-hover:bg-primary! group-hover:border-primary group-hover:text-primary-foreground! rounded-full px-4! transition-all duration-300'
                asChild
              >
                <Link href='https://github.com/AruNi-01/atmos'>
                  Details <EyeIcon className='stroke-foreground group-hover:stroke-primary-foreground' />
                </Link>
              </Button>
            </div>
          </div>

          {/* Feature 2 */}
          <div className='group relative flex flex-col gap-6'>
            <div className='lg:h-93.5'>
              <div className={cn('overflow-hidden rounded-[12px] border shadow-sm group-hover:-rotate-3 bg-muted transition-all duration-300')}>
                <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-zinc-900/5 dark:bg-zinc-50/5">
                  <div className="text-6xl mb-4">🖥️</div>
                  <h3 className="text-xl font-medium">Visual Terminal</h3>
                  <p className="mt-2 text-sm opacity-70">Tmux-powered persistence with a modern UI wrapper.</p>
                </div>
              </div>
            </div>

            <div className='-z-1 flex items-center justify-between gap-4 md:gap-6'>
              <div className='flex flex-col gap-2.5'>
                <span className='text-2xl font-semibold'>Tmux Integration</span>
                <span className='text-muted-foreground text-lg'>Persistent Sessions</span>
              </div>

              <Button
                variant='outline'
                className='group-hover:bg-primary! group-hover:border-primary group-hover:text-primary-foreground! rounded-full px-4! transition-all duration-300'
                asChild
              >
                <Link href='https://github.com/AruNi-01/atmos'>
                  Details <EyeIcon className='stroke-foreground group-hover:stroke-primary-foreground' />
                </Link>
              </Button>
            </div>
          </div>

          {/* Feature 3 */}
          <div className='group relative flex flex-col gap-6'>
            <div className='lg:h-93.5'>
              <div className={cn('overflow-hidden rounded-[12px] border shadow-sm group-hover:rotate-3 bg-muted transition-all duration-300')}>
                <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-zinc-900/5 dark:bg-zinc-50/5">
                  <div className="text-6xl mb-4">🤖</div>
                  <h3 className="text-xl font-medium">Agent Native</h3>
                  <p className="mt-2 text-sm opacity-70">Run Claude, Codex, and other agents directly in terminal.</p>
                </div>
              </div>
            </div>
            <div className='-z-1 flex items-center justify-between gap-4 md:gap-6'>
              <div className='flex flex-col gap-2.5'>
                <span className='text-2xl font-semibold'>AI Powered</span>
                <span className='text-muted-foreground text-lg'>Seamless Agent Integration</span>
              </div>

              <Button
                variant='outline'
                className='group-hover:bg-primary! group-hover:border-primary group-hover:text-primary-foreground! rounded-full px-4! transition-all duration-300'
                asChild
              >
                <Link href='https://github.com/AruNi-01/atmos'>
                  Details <EyeIcon className='stroke-foreground group-hover:stroke-primary-foreground' />
                </Link>
              </Button>
            </div>
          </div>

          {/* Feature 4 */}
          <div className='group relative flex flex-col gap-6'>
            <div className='lg:h-93.5'>
              <div className={cn('overflow-hidden rounded-[12px] border shadow-sm group-hover:-rotate-3 bg-muted transition-all duration-300')}>
                <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-zinc-900/5 dark:bg-zinc-50/5">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-medium">Interactive Workflow</h3>
                  <p className="mt-2 text-sm opacity-70">Review diffs, comment to agents, and manage PRs.</p>
                </div>
              </div>
            </div>

            <div className='-z-1 flex items-center justify-between gap-4 md:gap-6'>
              <div className='flex flex-col gap-2.5'>
                <span className='text-2xl font-semibold'>Smart Reviews</span>
                <span className='text-muted-foreground text-lg'>Interactive Diff & Git</span>
              </div>

              <Button
                variant='outline'
                className='group-hover:bg-primary! group-hover:border-primary group-hover:text-primary-foreground! rounded-full px-4! transition-all duration-300'
                asChild
              >
                <Link href='https://github.com/AruNi-01/atmos'>
                  Details <EyeIcon className='stroke-foreground group-hover:stroke-primary-foreground' />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </MotionPreset>
    </section>
  )
}

export default Portfolio
