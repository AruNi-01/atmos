'use client'

import Link from 'next/link'
import { ArrowUpRightIcon, FramerIcon, LaptopIcon, MessageSquareMoreIcon, PaletteIcon, PenToolIcon } from 'lucide-react'

import { Badge } from '@workspace/ui/components/ui/badge'
import { Button } from '@workspace/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/ui/card'
import { Separator } from '@workspace/ui/components/ui/separator'

import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Marquee } from '@workspace/ui/components/ui/marquee'
import { CraftButton, CraftButtonIcon, CraftButtonLabel } from '@workspace/ui/components/ui/craft-button'

const skills = [
  'Rust', 'Tauri', 'React', 'Axum', 'SQLite', 'Tmux', 'Tokio', 'Git'
]

const servicesData = [
  {
    title: 'Core System',
    description: 'Built with Rust for performance and safety. Utilizing Axum for backend logic and Tokio for async operations.',
    icon: LaptopIcon,
    className: 'bg-muted/50'
  },
  {
    title: 'Visual Interface',
    description: 'Modern frontend built with React, Next.js, and Monaco Editor. Flexible window management with React Mosaic.',
    icon: PaletteIcon
  },
  {
    title: 'Native Capabilities',
    description: 'Powered by Tauri for native desktop experience. Direct PTY and Tmux integration for robust terminal management.',
    icon: PenToolIcon
  },
  {
    title: 'AI Integration',
    description: 'Seamlessly integrate with Claude Code, Codex, and local LLMs. Agent-native architecture for the future of coding.',
    icon: FramerIcon,
    className: 'bg-muted/50'
  }
]

const Services = () => {
  return (
    <section id='services' className='relative'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='relative overflow-hidden border-y xl:flex'
      >
        <div className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden'></div>

        <div className='mx-auto max-w-6xl space-y-8 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                Technology
              </Badge>
            </MotionPreset>
            <div className='flex justify-between gap-4 max-md:flex-col'>
              <MotionPreset delay={0.3} transition={{ duration: 0.5 }} className='max-w-100'>
                <h2 className='text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                  Built on Modern Foundations 🛠️
                </h2>
              </MotionPreset>
              <MotionPreset
                delay={0.3}
                fade
                blur
                slide={{ direction: 'down', offset: 50 }}
                transition={{ duration: 0.5 }}
              >
                <p className='text-muted-foreground max-w-xl text-lg'>
                  Leveraging the performance of Rust and the flexibility of Web Technologies to deliver a seamless, high-performance experience.
                </p>
              </MotionPreset>
            </div>
          </div>

          <MotionPreset delay={0.45} fade blur transition={{ duration: 0.6 }} className='-mx-4 sm:-mx-6 lg:-mx-8'>
            <Separator />
          </MotionPreset>

          {/* Grid */}
          <div className='grid gap-6 sm:grid-cols-2'>
            {servicesData.map((service, index) => (
              <MotionPreset
                key={service.title}
                fade
                blur
                slide={{ offset: 50, direction: index % 2 === 0 ? 'left' : 'right' }}
                delay={0.8 + (index * 0.2)}
                transition={{ duration: 0.6 }}
              >
                <Card className={`rounded-3xl border-0 shadow-none h-full ${service.className || ''}`}>
                  <CardHeader className='gap-3'>
                    <CardTitle className='flex items-center gap-2.5 text-xl'>
                      <service.icon className='size-5' />
                      <span>{service.title}</span>
                    </CardTitle>
                    <CardDescription className='text-lg'>
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full h-32 bg-background/50 rounded-lg animate-pulse" />
                  </CardContent>
                </Card>
              </MotionPreset>
            ))}
          </div>

          {/* Skills */}
          <MotionPreset
            className='relative'
            fade
            blur
            slide={{ direction: 'down', offset: 50 }}
            delay={1.35}
            transition={{ duration: 0.6 }}
          >
            <div className='from-background pointer-events-none absolute inset-y-0 left-0 z-1 w-35 bg-linear-to-r to-transparent max-sm:hidden' />
            <div className='from-background pointer-events-none absolute inset-y-0 right-0 z-1 w-35 bg-linear-to-l to-transparent max-sm:hidden' />
            <div className='w-full overflow-hidden'>
              <Marquee pauseOnHover duration={30} gap={1}>
                {skills.map((skill, index) => (
                  <Badge variant='outline' key={index} className='px-4 py-1 text-sm'>
                    {skill}
                  </Badge>
                ))}
              </Marquee>
            </div>
          </MotionPreset>

          <MotionPreset delay={1.5} fade blur transition={{ duration: 0.6 }} className='-mx-4 sm:-mx-6 lg:-mx-8'>
            <Separator />
          </MotionPreset>

          {/* Action Button */}
          <MotionPreset
            className='flex items-center justify-center gap-4'
            fade
            blur
            slide={{ direction: 'down', offset: 50 }}
            delay={1.65}
            transition={{ duration: 0.6 }}
          >
            <CraftButton asChild>
              <Link href='#'>
                <CraftButtonLabel>Documentation</CraftButtonLabel>
                <CraftButtonIcon>
                  <ArrowUpRightIcon className='size-3 stroke-2 transition-transform duration-500 group-hover:rotate-45' />
                </CraftButtonIcon>
              </Link>
            </CraftButton>
            <Separator className='h-9!' orientation='vertical' />
            <Button variant='outline' className='rounded-full' asChild>
              <Link href='#'>
                Join Community <MessageSquareMoreIcon className='size-4' />
              </Link>
            </Button>
          </MotionPreset>
        </div>
        <div className='m-6 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-xl:hidden'></div>
      </MotionPreset>
    </section>
  )
}

export default Services
