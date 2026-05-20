import LogoSvg from '@workspace/ui/components/logo-svg';
import { cn } from '@/lib/cn';
import type { ComponentProps } from 'react';

/** Sidebar brand — not a link. Fumadocs passes anchor props when `nav.title` is a component. */
export function AtmosLogo({ className }: ComponentProps<'a'>) {
  return (
    <div
      className={cn('inline-flex items-center gap-2 text-primary', className)}
      role="img"
      aria-label="Atmos"
    >
      <LogoSvg className="size-8 shrink-0" />
      <span className="text-sm font-bold uppercase tracking-widest select-none">ATMOS</span>
    </div>
  );
}
