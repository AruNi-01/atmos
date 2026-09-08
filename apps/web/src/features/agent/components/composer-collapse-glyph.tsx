"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@workspace/ui";

const SWAP =
  "origin-center transition-[opacity,transform] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:scale-100 motion-reduce:transition-none";

export function ComposerCollapseGlyph({
  icon: Icon,
  collapsed = false,
}: {
  icon: LucideIcon;
  collapsed?: boolean;
}) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
      <Icon
        className={cn(
          "absolute size-4",
          SWAP,
          "scale-100 opacity-100",
          "group-hover:scale-75 group-hover:opacity-0",
          "group-focus-visible:scale-75 group-focus-visible:opacity-0",
        )}
        aria-hidden
      />
      <ChevronDown
        className={cn(
          "absolute size-4",
          SWAP,
          collapsed ? "-rotate-90" : "rotate-0",
          "scale-75 opacity-0",
          "group-hover:scale-100 group-hover:opacity-100",
          "group-focus-visible:scale-100 group-focus-visible:opacity-100",
        )}
        aria-hidden
      />
    </span>
  );
}
