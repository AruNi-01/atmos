import { cn } from '@/lib/utils'

const OS_ICON_SRC = {
  apple: '/os/apple-logo-black.svg',
  windows: '/os/microsoft-icon-black.svg',
  linux: '/os/linux.svg',
} as const

export type OsIconId = keyof typeof OS_ICON_SRC

type OsIconProps = {
  os: OsIconId
  className?: string
}

/**
 * Renders black SVGs from /public/os as a mask so fill follows `currentColor`
 * (light/dark + e.g. primary-foreground on solid buttons).
 */
export function OsIcon({ os, className }: OsIconProps) {
  const src = OS_ICON_SRC[os]
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
