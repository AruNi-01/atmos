"use client";

import React from "react";
import { cn } from "@workspace/ui";

type ShortcutKeySequenceProps = {
  keys: string[];
  className?: string;
  keyClassName?: string;
};

export function ShortcutKeySequence({
  keys,
  className,
  keyClassName,
}: ShortcutKeySequenceProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className={cn(
            "inline-flex h-6 min-w-6 select-none items-center justify-center rounded-md border border-muted-foreground/20 bg-muted px-1.5 text-xs font-medium text-foreground shadow-sm",
            keyClassName,
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
