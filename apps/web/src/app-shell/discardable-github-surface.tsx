"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";

/**
 * Delay the first heavy-surface mount by one task so a quick hop can cancel it.
 * After the tree exists, keep it — tearing down a loaded view hitches the next
 * shortcut. The parent hides idle views with opacity.
 */
export function DiscardableHeavySurface({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted || !active) return;
    const timeoutId = window.setTimeout(() => {
      startTransition(() => setMounted(true));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [active, mounted]);

  if (!mounted) return null;
  return children;
}
