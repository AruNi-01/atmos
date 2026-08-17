import type { HTMLAttributes } from 'react'

import { cn } from '../lib/utils'
import markSrc from '../assets/atmos-mark.png'

const markHref = typeof markSrc === 'string' ? markSrc : markSrc.src

type LogoSvgProps = HTMLAttributes<HTMLSpanElement> & {
  width?: number | string
  height?: number | string
}

/**
 * App mark from `Logo.png`.
 * An invisible `<img>` provides the true aspect ratio; a CSS mask paints `currentColor`.
 */
const LogoSvg = ({
  className,
  width,
  height,
  style,
  ...props
}: LogoSvgProps) => {
  return (
    <span
      {...props}
      className={cn('relative inline-block h-[1em] w-auto shrink-0', className)}
      style={{ width, height, ...style }}
    >
      <img
        src={markHref}
        alt=''
        draggable={false}
        className='pointer-events-none block h-full w-auto max-w-none select-none opacity-0'
      />
      <span
        aria-hidden
        className='absolute inset-0 bg-current'
        style={{
          maskImage: `url(${markHref})`,
          WebkitMaskImage: `url(${markHref})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
    </span>
  )
}

export default LogoSvg
