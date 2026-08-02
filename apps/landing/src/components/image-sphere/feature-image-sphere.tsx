'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { XIcon } from 'lucide-react'
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
}

export function FeatureImageSphere({ features, className }: FeatureImageSphereProps) {
  const t = useTranslations('featureShowcase')
  const hostRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<ImageSphere | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const focused = focusedId ? features.find((f) => f.id === focusedId) ?? null : null

  useEffect(() => {
    const host = hostRef.current
    if (!host || features.length === 0) return

    let cancelled = false
    let sphere: ImageSphere | null = null

    const boot = async () => {
      setReady(false)
      setError(null)
      setFocusedId(null)

      try {
        const items: SphereItem[] = await Promise.all(
          features.map(async (feature, index) => {
            const coverUrl = await createFeatureCover({
              title: feature.label || feature.title,
              label: feature.title !== feature.label ? feature.title : undefined,
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

        // Tear down previous instance if any
        sphereRef.current?.destroy()
        sphereRef.current = null
        host.replaceChildren()

        sphere = new ImageSphere(host, items, {
          distance: host.clientWidth < 640 ? 620 : 520,
          fov: host.clientWidth < 640 ? 32 : 25,
          onFocusChange: (id) => {
            if (!cancelled) setFocusedId(id)
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
    }
  }, [features])

  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <div
        ref={hostRef}
        className={cn(
          'relative h-[min(72vh,560px)] w-full overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 via-background to-background sm:h-[min(70vh,640px)]',
          'dark:from-zinc-950 dark:via-background dark:to-background'
        )}
        aria-label={t('title')}
      />

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-border/60 bg-background/70 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
            {t('sphere.loading')}
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {focused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-background via-background/80 to-transparent p-4 pt-16 sm:p-6">
          <div className="min-w-0 max-w-xl">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {focused.label}
            </p>
            <h3 className="mt-1 truncate text-base font-semibold text-foreground sm:text-lg">
              {focused.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{focused.description}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto size-9 shrink-0 rounded-full bg-background/80 backdrop-blur"
            aria-label={t('sphere.close')}
            title={t('sphere.close')}
            onClick={() => sphereRef.current?.clearFocus()}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      )}

      {ready && !focused && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[11px] text-muted-foreground/80 sm:bottom-4 sm:text-xs">
          {t('sphere.hint')}
        </p>
      )}
    </div>
  )
}
