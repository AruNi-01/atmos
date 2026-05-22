'use client';

import React from 'react';
import { GeistPixelSquare } from 'geist/font/pixel';
import { cn, TextShimmer } from '@workspace/ui';
import LogoSvg from '@workspace/ui/components/logo-svg';

interface AtmosWordmarkProps {
  className?: string;
  logoClassName?: string;
  letterClassName?: string;
  sloganClassName?: string;
  sloganShimmer?: boolean;
  sloganShimmerStyle?: React.CSSProperties;
  /** `spread` fills the row; `compact` keeps letters grouped for hero/loading. */
  layout?: 'spread' | 'compact';
}

export const AtmosWordmark: React.FC<AtmosWordmarkProps> = ({
  className,
  logoClassName,
  letterClassName,
  sloganClassName,
  sloganShimmer = false,
  sloganShimmerStyle,
  layout = 'spread',
}) => {
  const sloganText = 'Atmosphere for Agentic Builders';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        className={cn(
          'group flex w-full max-w-3xl cursor-default select-none items-center',
          layout === 'compact'
            ? 'justify-center gap-3 sm:gap-4 md:gap-5'
            : 'justify-between',
          GeistPixelSquare.className,
        )}
      >
        <span
          className={cn(
            'text-[10rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm',
            letterClassName
          )}
        >
          A
        </span>
        <span
          className={cn(
            'text-[10rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm',
            letterClassName
          )}
        >
          t
        </span>
        <span
          className={cn(
            'text-[10rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm',
            letterClassName
          )}
        >
          m
        </span>
        <LogoSvg
          className={cn(
            'size-36 shrink-0 text-foreground drop-shadow-sm transition-transform duration-1000 group-hover:rotate-90',
            logoClassName
          )}
        />
        <span
          className={cn(
            'text-[10rem] font-normal uppercase leading-[0.75] tracking-normal text-foreground drop-shadow-sm',
            letterClassName
          )}
        >
          s
        </span>
      </div>
      {sloganShimmer ? (
        <TextShimmer
          as="p"
          duration={2.8}
          spread={2.2}
          className={cn(
            'pt-6 text-center text-[1.375rem] font-medium tracking-wide',
            sloganClassName
          )}
          style={sloganShimmerStyle}
        >
          {sloganText}
        </TextShimmer>
      ) : (
        <p
          className={cn(
            'pt-6 text-center text-[1.375rem] font-medium tracking-wide text-muted-foreground',
            sloganClassName
          )}
        >
          {sloganText}
        </p>
      )}
    </div>
  );
};
