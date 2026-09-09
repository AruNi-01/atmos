"use client";

import React from "react";
import { Command } from "lucide-react";

export function ShortcutHint({ digit }: { digit: number | string }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
      <Command className="size-3" />
      <span className="text-xs">{digit}</span>
    </kbd>
  );
}

/** Kind chip for inverted tab-strip tooltips. Matches ShortcutHint surface, pill shape. */
export function CenterStageTabKindChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-center-tab-kind-chip=""
      className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center rounded-full border border-border bg-muted px-1.5 text-[10px] font-medium leading-none text-foreground/90"
    >
      {children}
    </span>
  );
}

export function CenterStageShortcutTooltipBody({
  children,
  digit,
  kind,
}: {
  children: React.ReactNode;
  digit?: number | string | null;
  /** Optional TUI / Chat UI chip, rendered to the right of the title. */
  kind?: React.ReactNode;
}) {
  const hasDigit = digit != null && digit !== "";
  const kindChip = kind ? <CenterStageTabKindChip>{kind}</CenterStageTabKindChip> : null;
  if (!hasDigit && !kindChip) return children;
  return (
    <div className="flex items-center gap-2">
      {children}
      {kindChip}
      {hasDigit ? <ShortcutHint digit={digit} /> : null}
    </div>
  );
}
