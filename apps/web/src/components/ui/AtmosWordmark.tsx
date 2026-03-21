'use client';

import React from 'react';
import { GeistPixelSquare } from 'geist/font/pixel';
import { cn } from '@workspace/ui';
import LogoSvg from '@workspace/ui/components/logo-svg';

interface AtmosWordmarkProps {
  className?: string;
  logoClassName?: string;
  letterClassName?: string;
  sloganClassName?: string;
}

export const AtmosWordmark: React.FC<AtmosWordmarkProps> = ({
  className,
  logoClassName,
  letterClassName,
  sloganClassName,
}) => {
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        className={cn(
          'group flex w-full max-w-3xl items-center justify-between cursor-default select-none',
          GeistPixelSquare.className
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
        <p
        className={cn(
          'pt-6 text-center text-[1.375rem] font-medium tracking-wide text-muted-foreground',
          sloganClassName
        )}
      >
        Atmosphere for Agentic Builders
      </p>
    </div>
  );
};
