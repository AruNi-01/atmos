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
  const logoSpacingClass =
    layout === 'compact' ? undefined : 'mx-0.5 sm:mx-1';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        className={cn(
          'flex w-full max-w-3xl cursor-default select-none items-center text-[10rem] font-normal uppercase leading-none tracking-normal text-foreground drop-shadow-sm',
          layout === 'compact'
            ? 'justify-center gap-2 sm:gap-2.5 md:gap-3'
            : 'justify-between',
          GeistPixelSquare.className,
          letterClassName,
        )}
      >
        <span>A</span>
        <span>t</span>
        <span>m</span>
        <LogoSvg
          className={cn(
            'mx-[0.04em] h-[0.72em] w-auto',
            logoSpacingClass,
            logoClassName
          )}
        />
        <span>s</span>
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
