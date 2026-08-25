"use client";

import React from "react";
import { cn } from "@workspace/ui";
import {
  useHeldShortcutPrefix,
  useSidebarShortcutDigit,
} from "@/app-shell/held-shortcut-prefix-store";
import { shortcutModGlyph } from "@/app-shell/shortcut-prefix";

export function HeldShortcutBadge({
  keys,
  className,
}: {
  keys: Array<string | number>;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-4 shrink-0 items-center gap-px rounded border border-border/70 bg-muted/90 px-1 font-mono text-[10px] font-medium leading-none tabular-nums text-muted-foreground",
        className,
      )}
    >
      {keys.map((key, index) => (
        <span key={`${key}:${index}`}>{key}</span>
      ))}
    </kbd>
  );
}

export function SidebarHeldShortcutBadge({
  targetKey,
  className,
}: {
  targetKey: string;
  className?: string;
}) {
  const digit = useSidebarShortcutDigit(targetKey);
  if (digit == null) return null;
  return (
    <HeldShortcutBadge
      className={className}
      keys={[shortcutModGlyph(), "⇧", digit]}
    />
  );
}

export function CenterHeldShortcutBadge({
  digit,
  className,
}: {
  digit: number | string | null | undefined;
  className?: string;
}) {
  if (digit == null || digit === "") return null;
  return <HeldShortcutBadge className={className} keys={[shortcutModGlyph(), digit]} />;
}

export function CenterTabHeldShortcut({
  digit,
  className,
}: {
  digit: number | string | null | undefined;
  className?: string;
}) {
  const prefix = useHeldShortcutPrefix();
  if (prefix !== "mod" || digit == null || digit === "") return null;
  return (
    <span
      className={cn(
        // Cover the trailing edge of the existing tab. Stay out of flow so
        // ⌘1–9 cannot widen the pill or shift neighbors.
        "pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-end rounded-r-full pl-3 pr-1.5",
        "bg-gradient-to-l from-background from-40% to-transparent",
        "in-[[aria-selected=true]]:from-active",
      )}
    >
      <CenterHeldShortcutBadge digit={digit} className={className} />
    </span>
  );
}
