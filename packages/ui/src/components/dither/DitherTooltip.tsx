"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import type { DitherTheme } from "../../lib/dither/math";
import {
  SlidingMetric,
  type SlidingMetricParts,
} from "../ui/sliding-metric";

export type DitherTooltipSliding = SlidingMetricParts;

export type DitherTooltipLine = {
  label: string;
  value: string;
  /**
   * When set, render SlidingMetric so scrubbing / metric switches animate
   * digits instead of a hard string swap. `value` stays as fallback text.
   */
  sliding?: DitherTooltipSliding;
  /** Preferred over `color` when present (e.g. agent brand icon). */
  icon?: ReactNode;
  /** Fallback swatch when `icon` is not provided. */
  color?: string;
};

export type DitherTooltipState = {
  /** Viewport coordinates (clientX/Y). */
  clientX: number;
  clientY: number;
  title?: string;
  lines: DitherTooltipLine[];
};

export type DitherTooltipProps = {
  state: DitherTooltipState | null;
  theme?: DitherTheme;
};

const WIDTH = 200;
const OFFSET = 14;

type TooltipContent = {
  title?: string;
  lines: DitherTooltipLine[];
};

function contentSignature(content: TooltipContent): string {
  return JSON.stringify({
    title: content.title ?? "",
    lines: content.lines.map((line) => ({
      label: line.label,
      value: line.value,
      color: line.color ?? null,
      sliding: line.sliding
        ? {
            value: line.sliding.value,
            prefix: line.sliding.prefix ?? "",
            suffix: line.sliding.suffix ?? "",
            decimals: line.sliding.decimals ?? null,
            decimalSeparator: line.sliding.decimalSeparator ?? ".",
          }
        : null,
    })),
  });
}

function clampTooltipPosition(clientX: number, clientY: number) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const preferRight = clientX < vw / 2;
  let left = preferRight ? clientX + OFFSET : clientX - WIDTH - OFFSET;
  left = Math.max(12, Math.min(left, vw - WIDTH - 12));
  let top = clientY - 12;
  top = Math.max(12, Math.min(top, vh - 200));
  return { left, top };
}

/**
 * Soft whole-string fade only when `value` actually changes.
 * Character-level TextMorph is a poor fit for a moving tooltip shell: mid-morph
 * glyphs clip out of the bubble ("okens", "r 2026") while the pointer scrubs.
 */
function TooltipText({ value }: { value: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.35 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
    >
      {value}
    </motion.span>
  );
}

/**
 * Keep SlidingMetric mounted at a stable tree slot so digit springs morph
 * across hover targets. Do not key this by label/value — those change often.
 */
function TooltipValue({
  sliding,
  fallback,
}: {
  sliding?: DitherTooltipSliding;
  fallback: string;
}) {
  if (sliding) {
    return (
      <SlidingMetric
        value={sliding.value}
        prefix={sliding.prefix}
        suffix={sliding.suffix}
        decimals={sliding.decimals}
        decimalSeparator={sliding.decimalSeparator}
      />
    );
  }
  return <TooltipText value={fallback} />;
}

/**
 * Floating mono tooltip for dither chart hover scrubbing.
 *
 * Position is applied imperatively (transform) so pointer moves do not re-render
 * the digit tree. Content updates only when title/lines actually change so
 * SlidingMetric stays mounted and springs between values.
 */
export function DitherTooltip({ state, theme = "dark" }: DitherTooltipProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const contentKeyRef = useRef("");
  const [content, setContent] = useState<TooltipContent | null>(null);
  const [open, setOpen] = useState(false);

  // Position must land before paint; content only when the payload changes.
  useLayoutEffect(() => {
    if (!state) {
      contentKeyRef.current = "";
      setOpen(false);
      setContent(null);
      return;
    }

    setOpen(true);

    const next: TooltipContent = {
      title: state.title,
      lines: state.lines,
    };
    const nextKey = contentSignature(next);
    if (nextKey !== contentKeyRef.current) {
      contentKeyRef.current = nextKey;
      setContent(next);
    }

    const el = shellRef.current;
    if (el) {
      const { left, top } = clampTooltipPosition(state.clientX, state.clientY);
      el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }
  }, [state]);

  // Apply position even on the first paint after open (ref may be null in effect
  // above if we just flipped open). Re-run when content mounts the shell.
  useLayoutEffect(() => {
    if (!state || !shellRef.current) return;
    const { left, top } = clampTooltipPosition(state.clientX, state.clientY);
    shellRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, [state, content, open]);

  if (!open || !content || typeof document === "undefined") return null;

  const isDark = theme === "dark";

  return createPortal(
    <div
      ref={shellRef}
      className={cn(
        "pointer-events-none fixed z-[200] w-[200px] overflow-hidden rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl will-change-transform",
        // top/left stay 0; we move with transform for GPU-friendly tracking.
        "left-0 top-0",
        isDark
          ? "border-white/10 bg-[#1a1a1a]/95 text-white shadow-black/40"
          : "border-black/10 bg-white/95 text-black shadow-black/10",
      )}
      role="tooltip"
    >
      {content.title ? (
        <div
          className={cn(
            "mb-1.5 max-w-full text-[11px] font-medium",
            isDark ? "text-white/90" : "text-black/90",
          )}
        >
          <TooltipText value={content.title} />
        </div>
      ) : null}
      <div className="space-y-1">
        {content.lines.map((line, index) => (
          // Index-only keys keep SlidingMetric mounted when labels/values change
          // (e.g. share % label, agent name) so digits spring instead of remount.
          <div
            key={`tip-line-${index}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {line.icon ? (
                <span className="inline-flex size-3.5 shrink-0 items-center justify-center [&>*]:max-h-full [&>*]:max-w-full">
                  {line.icon}
                </span>
              ) : line.color ? (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: line.color }}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "min-w-0 truncate",
                  isDark ? "text-white/50" : "text-black/50",
                )}
              >
                <TooltipText value={line.label} />
              </span>
            </span>
            <span className="inline-flex min-w-[3.5ch] shrink-0 items-center justify-end tabular-nums font-medium">
              <TooltipValue sliding={line.sliding} fallback={line.value} />
            </span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Exponential smooth toward target each frame (dt-ish with fixed step). */
export function smoothToward(current: number, target: number, rate = 0.18): number {
  return current + (target - current) * rate;
}
