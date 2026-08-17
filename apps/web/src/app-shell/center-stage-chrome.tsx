"use client";

import React from "react";
import {
  CENTER_STAGE_CARD_CLASS,
  CENTER_STAGE_GUTTER_CLASS,
  CENTER_STAGE_SHELL_CLASS,
} from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";

type CenterStageSurfaceProps = React.ComponentProps<"main"> & {
  cardClassName?: string;
  /** Create a containing block so WebGL/canvas paints clip to the card. */
  isolate?: boolean;
};

/** Inset gutters + rounded floating card used by every center-stage view. */
export function CenterStageSurface({
  children,
  className,
  cardClassName,
  isolate = true,
  ...props
}: CenterStageSurfaceProps) {
  return (
    <main
      {...props}
      className={cn(CENTER_STAGE_SHELL_CLASS, CENTER_STAGE_GUTTER_CLASS, className)}
    >
      <div
        className={cn(CENTER_STAGE_CARD_CLASS, isolate && "isolate", cardClassName)}
      >
        {children}
      </div>
    </main>
  );
}
