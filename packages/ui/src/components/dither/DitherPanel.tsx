"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { DitherTheme } from "../../lib/dither/math";

export type DitherPanelProps = {
  theme?: DitherTheme;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/** Showcase-style stage card for dither charts (pixel/mono aesthetic). */
export function DitherPanel({
  theme = "dark",
  title,
  description,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: DitherPanelProps) {
  const isDark = theme === "dark";

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-2xl border",
        isDark
          ? "border-white/[0.06] bg-[#141414] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          : "border-black/[0.06] bg-[#f4f4f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        className,
      )}
    >
      {(title || description || action) && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-inherit px-3 py-2.5 sm:px-4">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <div
                className={cn(
                  "font-mono text-[11px] font-medium",
                  isDark ? "text-white/55" : "text-black/50",
                )}
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <div
                className={cn(
                  "font-mono text-sm font-medium tracking-tight",
                  isDark ? "text-white/90" : "text-black/90",
                )}
              >
                {description}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={cn("relative min-h-0 flex-1 p-2.5 sm:p-3", bodyClassName)}>{children}</div>
      {footer ? (
        <footer
          className={cn(
            "shrink-0 border-t border-inherit px-3 py-2 font-mono text-[10px]",
            isDark ? "text-white/40" : "text-black/40",
          )}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
