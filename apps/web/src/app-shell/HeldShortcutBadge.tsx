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
        "pointer-events-none inline-flex h-5 shrink-0 items-center gap-px rounded border border-border/70 bg-muted/90 px-1 font-mono text-[10px] font-medium tabular-nums text-muted-foreground",
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
  if (prefix !== "mod") return null;
  return <CenterHeldShortcutBadge digit={digit} className={className} />;
}
