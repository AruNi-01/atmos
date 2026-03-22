'use client'

import { useState } from 'react'

import { DownloadIcon, ArrowRightIcon, ChevronDownIcon, TerminalIcon, MonitorIcon, CheckIcon, CopyIcon } from 'lucide-react'
import Link from 'next/link'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { BlinkingGrid } from '@/components/ui/blinking-grid'
import { PrimaryFlowButton } from '@workspace/ui/components/ui/flow-button'
import { Button } from '@workspace/ui/components/ui/button'

const ReadyDownload = () => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText('brew install --cask AruNi-01/tap/atmos')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id='ready-download'>
      <MotionPreset className='relative overflow-hidden border-y xl:flex bg-background'>
        <BlinkingGrid className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden' />

        <div className='mx-auto bg-background flex w-full max-w-6xl shrink-0 flex-col items-center justify-center px-4 py-32 min-[1158px]:border-x sm:px-6 sm:py-40 lg:px-8'>
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 50 }}
            blur
            transition={{ duration: 0.5 }}
            className='flex max-w-3xl flex-col items-center space-y-8 text-center'
          >
            <div className='bg-muted/50 text-foreground ring-border flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ring-1'>
              <span className='bg-primary/20 flex size-2 items-center justify-center rounded-full'>
                <span className='bg-primary size-1.5 rounded-full' />
              </span>
              Desktop app is now available
            </div>

            <h2 className='text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl'>
              Ready to elevate your Agentic workspace?
            </h2>

            <p className='text-muted-foreground max-w-2xl text-xl'>
              Download Atmos for your operating system and transform the way you build software. Connect your first workspace in seconds.
            </p>

            <div className='flex flex-col items-center gap-4 pt-4 sm:flex-row'>
              <div className='flex items-center isolate overflow-hidden rounded-lg relative ring-2 ring-primary/60 w-full sm:w-72'>
                <Button size='lg' className='flex-1 h-14 rounded-r-none px-6 text-base font-medium hover:bg-primary transition-colors border-r border-primary-foreground/20' asChild>
                  <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer'>
                    <DownloadIcon className='mr-2 size-5' />
                    Download for MacOS
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size='lg' className='h-14 rounded-l-none px-3 border-none ring-0 hover:bg-primary transition-colors hover:text-primary-foreground'>
                      <ChevronDownIcon className='size-5' />
                      <span className='sr-only'>More download options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-[calc(100vw-2rem)] sm:w-72 font-medium'>
                    <DropdownMenuItem asChild>
                      <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        MacOS (Apple Silicon)
                        <span className='ml-auto text-xs text-muted-foreground'>Default</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        MacOS (Intel)
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <MonitorIcon className='mr-2 size-4 opacity-50' />
                        Windows (x64)
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <TerminalIcon className='mr-2 size-4 opacity-50' />
                        Linux (AppImage)
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button size='lg' variant='ghost' className='h-14 px-8 text-base' asChild>
                <Link href='https://github.com/AruNi-01/atmos' target='_blank' rel='noopener noreferrer' className='group'>
                  View GitHub
                  <ArrowRightIcon className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </Button>
            </div>

            <div className='mt-8 max-w-md w-full'>
              <div className='flex items-center justify-between overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group'>
                <span className='opacity-50 select-none absolute left-4'>$</span>
                <code className='pl-6 overflow-x-auto whitespace-nowrap text-muted-foreground mr-4 py-1.5 flex-1 text-left'>
                  brew install --cask AruNi-01/tap/atmos
                </code>
                <Button
                  variant='ghost'
                  size='icon'
                  className='shrink-0 opacity-0 group-hover:opacity-100 transition-opacity'
                  onClick={copyToClipboard}
                  aria-label='Copy command'
                >
                  {copied ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                </Button>
              </div>
            </div>
          </MotionPreset>
        </div>

        <BlinkingGrid className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden' />
      </MotionPreset>
    </section>
  )
}

export default ReadyDownload
