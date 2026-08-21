import LogoSvg from '@workspace/ui/components/logo-svg';
import { cn } from '@/lib/cn';
import type { ComponentProps } from 'react';

const LANDING_URL = 'https://atmos.land';

/** Sidebar brand — Fumadocs passes home-page `href`; we send visitors to atmos.land instead. */
export function AtmosLogo({ className }: ComponentProps<'a'>) {
  return (
    <a
      href={LANDING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-2 text-primary', className)}
      aria-label="Atmos"
    >
      <LogoSvg className="h-5 w-auto shrink-0" />
      <span className="text-sm font-bold uppercase tracking-widest select-none">ATMOS</span>
    </a>
  );
}
