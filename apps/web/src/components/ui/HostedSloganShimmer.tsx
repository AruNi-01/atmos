'use client';

import { cn, TextShimmer } from '@workspace/ui';

const SLOGAN = 'Atmosphere for Agentic Builders';

/** Hosted hero slogan — keep outside motion/AnimatePresence parents so shimmer can loop. */
export function HostedSloganShimmer({ className }: { className?: string }) {
  return (
    <TextShimmer
      as="p"
      duration={3.2}
      spread={2.2}
      className={cn(
        'text-center text-lg font-medium tracking-wide sm:text-xl',
        className,
      )}
    >
      {SLOGAN}
    </TextShimmer>
  );
}
