'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Badge } from '@workspace/ui/components/ui/badge'

const features = [
  {
    title: 'AI Agent Workspace',
    description: 'Agent panel with streaming responses, tool call updates, and custom ACP agent support.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Project Wiki',
    description: 'A URL-synced Wiki tab with automated generation integrated with terminal automation.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Global Search',
    description: 'Unified command surface for navigation, file/code search, and app quick actions.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Git Intelligence',
    description: 'AI-assisted commits, code-review workflows, and detailed PR context parsing.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Run Preview',
    description: 'Built-in Run Preview panel for rapid "run-and-verify" script workflows.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Terminal & Tmux',
    description: 'Persistent, tmux-backed terminals that preserve logic and reattach cleanly.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
  {
    title: 'Usage Observability',
    description: 'Provider-specific token visualization to keep an eye on active AI expenses.',
    videoUrl: 'https://www.pexels.com/zh-cn/download/video/34312649/',
  },
]

const DURATION = 5000 // 5 seconds per slide

export default function FeatureShowcase() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Track the actual video element to control playback if needed
  const videoRef = useRef<HTMLVideoElement>(null)

  // Combined effect: manage timer and auto-advance slides
  useEffect(() => {
    if (isHovering) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const nextProgress = prev + (100 / (DURATION / 50))
        if (nextProgress >= 100) {
          // Use setTimeout to defer state update and avoid cascading renders
          setTimeout(() => {
            setActiveIndex((idx) => (idx + 1) % features.length)
          }, 0)
          return 0
        }
        return nextProgress
      })
    }, 50)

    timerRef.current = interval

    return () => {
      clearInterval(interval)
    }
  }, [isHovering])

  // Reset progress when active index changes manually
  const handleManualChange = (index: number) => {
    setActiveIndex(index)
    setProgress(0)
  }

  return (
    <section id="features" className='relative'>
      <MotionPreset
        fade
        blur
        transition={{ duration: 0.5 }}
        delay={0.15}
        className='relative overflow-hidden border-y xl:flex'
      >
        <div className='m-6 w-full shrink-2 max-xl:hidden'></div>

        <div className='mx-auto w-full max-w-6xl shrink-0 space-y-8 px-4 py-8 min-[1158px]:border-x sm:space-y-16 sm:px-6 sm:py-16 lg:px-8'>
          <div className='space-y-2.5'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
              <Badge variant='outline' className='rounded-none'>
                Features
              </Badge>
            </MotionPreset>
            <MotionPreset delay={0.3} transition={{ duration: 0.5 }}>
              <h2 className='text-2xl font-semibold sm:text-3xl lg:text-4xl'>
                See Atmos in Action
              </h2>
            </MotionPreset>
          </div>

          {/* Container for Video & Nav */}
          <MotionPreset fade slide blur transition={{ duration: 0.5 }} delay={0.4}>
            <div className="flex flex-col rounded-3xl border border-border/50 bg-muted/20 p-2 md:p-3 ring-1 ring-white/5">
              {/* Main Video Display */}
              <div
                className="relative aspect-video w-full rounded-2xl overflow-hidden border border-border/50shadow-2xl group"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 size-full"
                  >
                    <video
                      ref={videoRef}
                      src={features[activeIndex].videoUrl}
                      autoPlay
                      muted
                      loop
                      className="size-full object-cover"
                      playsInline
                      suppressHydrationWarning
                    />
                    {/* Overlay Content */}
                    <div className="absolute inset-0 bg-muted/50 dark:bg-black/50 p-8 flex flex-col justify-end items-start pointer-events-none">
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 2 }}
                      >
                        <h3 className="text-3xl font-bold text-white mb-2">{features[activeIndex].title}</h3>
                        <p className="text-white/80 text-lg max-w-2xl">{features[activeIndex].description}</p>
                      </motion.div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
                {features.map((feature, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={index}
                      onClick={() => handleManualChange(index)}
                      className={cn(
                        "relative flex flex-col items-start p-3 rounded-lg text-left transition-all duration-300 group/btn h-full overflow-hidden cursor-pointer",
                        isActive ? "bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      {/* Progress Bar Background */}
                      {isActive && (
                        <div className="absolute top-0 left-0 h-1 w-full bg-border">
                          <motion.div
                            className="h-full bg-primary"
                            style={{ width: `${progress}%` }}
                            transition={{ duration: 0, ease: "linear" }}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2 w-full">
                        <span className={cn(
                          "text-sm font-semibold whitespace-nowrap",
                          isActive ? "text-foreground" : "text-muted-foreground group-hover/btn:text-foreground"
                        )}>
                          {feature.title}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </MotionPreset>
        </div>

        <div className='m-6 w-full shrink-2 max-xl:hidden'></div>
      </MotionPreset>
    </section>
  )
}
