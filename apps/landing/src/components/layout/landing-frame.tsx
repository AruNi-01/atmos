import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared landing column frame.
 *
 * Keeps left/right vertical rails on a single centered track (`max-w-6xl` /
 * 72rem) so every section’s borders stay aligned while resizing.
 *
 * Wide screens (`xl+`): 3-column grid with equal side rails (star-dot panels)
 * and a fixed 72rem center — the vertical lines never drift relative to each
 * other as the viewport shrinks within the xl range.
 *
 * Narrower screens: single centered column, still max-w-6xl, same border-x.
 */
export function LandingFrame({
  children,
  side,
  className,
  contentClassName,
  showBorder = true,
}: {
  children: ReactNode
  /** Optional side-rail content (e.g. BlinkingGrid). Rendered on both sides at xl+. */
  side?: ReactNode
  className?: string
  contentClassName?: string
  showBorder?: boolean
}) {
  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'mx-auto grid w-full max-w-6xl',
          // Fixed center track at xl so rails stay on the 72rem box edges.
          'xl:max-w-none xl:grid-cols-[minmax(0,1fr)_72rem_minmax(0,1fr)]'
        )}
      >
        <div className="relative hidden min-h-0 min-w-0 xl:block" aria-hidden>
          {side}
        </div>

        <div
          className={cn(
            'relative min-w-0 w-full',
            showBorder && 'border-x',
            contentClassName
          )}
        >
          {children}
        </div>

        <div className="relative hidden min-h-0 min-w-0 xl:block" aria-hidden>
          {side}
        </div>
      </div>
    </div>
  )
}

/** Shared side-rail surface (star dots / grid). */
export const landingRailClassName =
  'h-full min-h-0 w-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px]'
