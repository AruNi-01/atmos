'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@workspace/ui/components/ui/button'
import { ImageSphere, type SphereItem } from './engine'
import { createFeatureCover } from './create-feature-cover'

export type FeatureSphereItem = {
  id: string
  title: string
  label: string
  description: string
  icon: LucideIcon
  videoUrl: string
  accent?: string
}

const ACCENTS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#fbbf24',
  '#60a5fa',
  '#fb7185',
  '#2dd4bf',
  '#c084fc',
  '#4ade80',
  '#f59e0b',
  '#22d3ee',
  '#e879f9',
  '#94a3b8',
]

type FeatureImageSphereProps = {
  features: FeatureSphereItem[]
  className?: string
  /** Fired when a card is focused / unfocused (for section chrome hide/show). */
  onFocusChange?: (focused: boolean) => void
}

/**
 * 3D image sphere — open/close animation is the original plane focus (flies
 * from sphere slot → center and back home). Extra UI chrome (progress, back/next)
 * sits over the canvas when focused.
 */
export function FeatureImageSphere({ features, className, onFocusChange }: FeatureImageSphereProps) {
  const t = useTranslations('featureShowcase')
  const hostRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<ImageSphere | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  const focusedIndex = focusedId ? features.findIndex((f) => f.id === focusedId) : -1
  const focused = focusedIndex >= 0 ? features[focusedIndex] ?? null : null
  const count = features.length

  useEffect(() => {
    const host = hostRef.current
    if (!host || features.length === 0) return

    let cancelled = false
    let sphere: ImageSphere | null = null

    const boot = async () => {
      setReady(false)
      setError(null)
      setFocusedId(null)
      setProgress(0)

      try {
        const items: SphereItem[] = await Promise.all(
          features.map(async (feature, index) => {
            const coverUrl = await createFeatureCover({
              title: feature.title,
              videoUrl: feature.videoUrl,
              icon: feature.icon,
              accent: feature.accent ?? ACCENTS[index % ACCENTS.length],
            })
            return {
              id: feature.id,
              coverUrl,
              videoUrl: feature.videoUrl,
            }
          })
        )

        if (cancelled || !hostRef.current) return

        sphereRef.current?.destroy()
        sphereRef.current = null
        host.replaceChildren()

        sphere = new ImageSphere(host, items, {
          distance: host.clientWidth < 640 ? 620 : 520,
          fov: host.clientWidth < 640 ? 32 : 25,
          onFocusChange: (id) => {
            if (cancelled) return
            setFocusedId(id)
            onFocusChangeRef.current?.(Boolean(id))
            if (!id) setProgress(0)
          },
          onProgress: (p) => {
            if (!cancelled) setProgress(p * 100)
          },
          onVideoEnded: () => {
            if (cancelled) return
            // Advance to next feature in fixed list order (plane flies home → next flies in)
            const current = sphereRef.current?.getFocusedId()
            if (!current) return
            const idx = features.findIndex((f) => f.id === current)
            if (idx < 0) return
            const next = features[(idx + 1) % features.length]
            if (next) sphereRef.current?.focusById(next.id)
          },
        })
        sphereRef.current = sphere
        sphere.start()
        if (!cancelled) setReady(true)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load feature sphere')
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
      sphere?.destroy()
      if (sphereRef.current === sphere) sphereRef.current = null
      onFocusChangeRef.current?.(false)
    }
  }, [features])

  const closeFocus = useCallback(() => {
    sphereRef.current?.clearFocus()
  }, [])

  const goToIndex = useCallback(
    (index: number) => {
      if (count === 0) return
      const next = ((index % count) + count) % count
      const item = features[next]
      if (item) {
        setProgress(0)
        sphereRef.current?.focusById(item.id)
        setFocusedId(item.id)
      }
    },
    [count, features]
  )

  const goPrev = useCallback(() => {
    if (focusedIndex < 0) return
    goToIndex(focusedIndex - 1)
  }, [focusedIndex, goToIndex])

  const goNext = useCallback(() => {
    if (focusedIndex < 0) return
    goToIndex(focusedIndex + 1)
  }, [focusedIndex, goToIndex])

  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFocus()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, closeFocus, goPrev, goNext])

  return (
    <div className={cn('relative h-full w-full min-w-0', className)}>
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full overflow-hidden bg-background"
        aria-label={t('title')}
      />

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-full border border-border/60 bg-background/70 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
            {t('sphere.loading')}
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* Focus chrome only — open/close motion is the 3D plane itself */}
      <AnimatePresence>
        {focused && (
          <motion.div
            key="focus-chrome"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="bg-gradient-to-t from-background via-background/90 to-transparent px-3 pb-4 pt-16 sm:px-6 sm:pb-6">
              {/* Progress divider */}
              <div
                className="relative mb-3 h-1 w-full overflow-hidden rounded-full bg-foreground/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                aria-label="playback progress"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-foreground/80"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="pointer-events-auto flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">
                    {focused.title}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                    {focused.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-1 rounded-full px-3"
                    aria-label={t('sphere.prev')}
                    title={t('sphere.prev')}
                    onClick={goPrev}
                  >
                    <ChevronLeftIcon className="size-4" />
                    <span className="text-sm font-medium">{t('sphere.prev')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-1 rounded-full px-3"
                    aria-label={t('sphere.next')}
                    title={t('sphere.next')}
                    onClick={goNext}
                  >
                    <span className="text-sm font-medium">{t('sphere.next')}</span>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
