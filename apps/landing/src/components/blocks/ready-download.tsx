'use client'

import { useState, useEffect } from 'react'

import { ArrowRightIcon, ChevronDownIcon, CheckIcon, CopyIcon } from 'lucide-react'
import Link from 'next/link'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/ui/dropdown-menu'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { TextShimmer } from '@workspace/ui/components/ui/text-shimmer'
import { BlinkingGrid } from '@/components/ui/blinking-grid'
import { Button } from '@workspace/ui/components/ui/button'
import { Badge } from '@workspace/ui/components/ui/badge'
import { OsIcon } from '@/components/os-icon'

const RELEASES_URL = 'https://github.com/AruNi-01/atmos/releases'

type DownloadLinks = {
  macAppleSilicon: string
  macIntel: string
  windows: string
  linux: string
}

const createDefaultDownloadLinks = (): DownloadLinks => ({
  macAppleSilicon: RELEASES_URL,
  macIntel: RELEASES_URL,
  windows: RELEASES_URL,
  linux: RELEASES_URL
})

const ReadyDownload = () => {
  const [copied, setCopied] = useState('')
  const [downloadLinks, setDownloadLinks] = useState<DownloadLinks>(createDefaultDownloadLinks)

  useEffect(() => {
    fetch('/api/download-links')
      .then(res => res.json())
      .then((data: Partial<DownloadLinks>) => {
        setDownloadLinks({
          macAppleSilicon: data.macAppleSilicon ?? RELEASES_URL,
          macIntel: data.macIntel ?? RELEASES_URL,
          windows: data.windows ?? RELEASES_URL,
          linux: data.linux ?? RELEASES_URL
        })
      })
      .catch(console.error)
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 2000)
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
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                Desktop & Local Web Runtime Available
              </Badge>
            </MotionPreset>

            <h2 className='text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl'>
              Ready to elevate your Agentic workspace?
            </h2>

            <p className='text-muted-foreground max-w-2xl text-xl'>
              Choose your installation method: Desktop app or Local Web Runtime. Download Atmos and transform the way you build software.
            </p>

            <div className='flex flex-col items-center gap-4 pt-4 sm:flex-row'>
              <div className='flex items-center isolate overflow-hidden rounded-lg relative ring-2 ring-primary/60 w-full sm:w-72'>
                <Button size='lg' className='flex-1 h-14 rounded-r-none px-6 text-base font-medium hover:bg-primary transition-colors border-r border-primary-foreground/20' asChild>
                  <Link href={downloadLinks.macAppleSilicon} target='_blank' rel='noopener noreferrer'>
                    <OsIcon os='apple' className='size-5' />
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
                      <Link href={downloadLinks.macAppleSilicon} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='apple' className='size-4' />
                        MacOS (Apple Silicon)
                        <span className='ml-auto text-xs text-muted-foreground'>Default</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.macIntel} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='apple' className='size-4' />
                        MacOS (Intel)
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.windows} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='windows' className='size-4' />
                        Windows (x64)
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={downloadLinks.linux} target='_blank' rel='noopener noreferrer' className='cursor-pointer py-2.5'>
                        <OsIcon os='linux' className='size-4' />
                        Linux (AppImage)
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button size='lg' variant='ghost' className='h-14 px-8 text-base' asChild>
                <Link href='https://github.com/AruNi-01/atmos/releases' target='_blank' rel='noopener noreferrer' className='group'>
                  View GitHub
                  <ArrowRightIcon className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </Button>
            </div>

            <div className='mt-8 w-full max-w-2xl space-y-6'>
              {/* Desktop Installation */}
              <div className='space-y-3'>
                <h3 className='text-sm font-medium text-muted-foreground'>Desktop App</h3>
                <div className='space-y-2'>
                  <div className='inline-flex items-center overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group w-full'>
                    <img src='/icons/homebrew.svg' alt='Homebrew' className='size-4 opacity-60 select-none absolute left-4 top-1/2 -translate-y-1/2' />
                    <TextShimmer as='code' className='pl-7 overflow-x-auto whitespace-nowrap mr-2 py-1.5 flex-1 text-left'>brew install --cask AruNi-01/tap/atmos</TextShimmer>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 transition-opacity'
                      onClick={() => copyToClipboard('brew install --cask AruNi-01/tap/atmos')}
                      aria-label='Copy command'
                    >
                      {copied === 'brew install --cask AruNi-01/tap/atmos' ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                    </Button>
                  </div>
                  <div className='inline-flex items-center overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group w-full'>
                    <TextShimmer as='code' className='overflow-x-auto whitespace-nowrap mr-2 py-1.5 flex-1 text-left'>curl -fsSL https://install.atmos.land/install-desktop.sh | bash</TextShimmer>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 transition-opacity'
                      onClick={() => copyToClipboard('curl -fsSL https://install.atmos.land/install-desktop.sh | bash')}
                      aria-label='Copy command'
                    >
                      {copied === 'curl -fsSL https://install.atmos.land/install-desktop.sh | bash' ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Local Web Runtime Installation */}
              <div className='space-y-3'>
                <h3 className='text-sm font-medium text-muted-foreground'>Local Web Runtime</h3>
                <div className='space-y-2'>
                  <div className='inline-flex items-center overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group w-full'>
                    <TextShimmer as='code' className='overflow-x-auto whitespace-nowrap mr-2 py-1.5 flex-1 text-left'>npx @atmos/local-web-runtime</TextShimmer>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 transition-opacity'
                      onClick={() => copyToClipboard('npx @atmos/local-web-runtime')}
                      aria-label='Copy command'
                    >
                      {copied === 'npx @atmos/local-web-runtime' ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                    </Button>
                  </div>
                  <div className='inline-flex items-center overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group w-full'>
                    <TextShimmer as='code' className='overflow-x-auto whitespace-nowrap mr-2 py-1.5 flex-1 text-left'>bunx @atmos/local-web-runtime</TextShimmer>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 transition-opacity'
                      onClick={() => copyToClipboard('bunx @atmos/local-web-runtime')}
                      aria-label='Copy command'
                    >
                      {copied === 'bunx @atmos/local-web-runtime' ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                    </Button>
                  </div>
                  <div className='inline-flex items-center overflow-hidden rounded-md border bg-muted/30 pl-4 pr-1 py-1 font-mono text-sm text-foreground shadow-sm relative group w-full'>
                    <TextShimmer as='code' className='overflow-x-auto whitespace-nowrap mr-2 py-1.5 flex-1 text-left'>curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash</TextShimmer>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0 transition-opacity'
                      onClick={() => copyToClipboard('curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash')}
                      aria-label='Copy command'
                    >
                      {copied === 'curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash' ? <CheckIcon className='size-4 text-green-500' /> : <CopyIcon className='size-4 text-muted-foreground' />}
                    </Button>
                  </div>
                </div>
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
