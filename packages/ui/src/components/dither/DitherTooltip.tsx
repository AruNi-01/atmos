"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import type { DitherTheme } from "../../lib/dither/math";

export type DitherTooltipLine = {
  label: string;
  value: string;
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
    })),
  });
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

/** Floating mono tooltip for dither chart hover scrubbing. */
export function DitherTooltip({ state, theme = "dark" }: DitherTooltipProps) {
  // Position tracks the pointer every frame; text content is sticky until
  // title/lines actually change so shell movement never re-triggers text fades.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [content, setContent] = useState<TooltipContent | null>(null);
  const contentKeyRef = useRef("");

  useEffect(() => {
    if (!state) {
      setPosition(null);
      setContent(null);
      contentKeyRef.current = "";
      return;
    }

    setPosition({ x: state.clientX, y: state.clientY });

    const next: TooltipContent = {
      title: state.title,
      lines: state.lines,
    };
    const nextKey = contentSignature(next);
    if (nextKey !== contentKeyRef.current) {
      contentKeyRef.current = nextKey;
      setContent(next);
    }
  }, [state]);

  if (!position || !content || typeof document === "undefined") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const preferRight = position.x < vw / 2;
  let left = preferRight ? position.x + OFFSET : position.x - WIDTH - OFFSET;
  left = Math.max(12, Math.min(left, vw - WIDTH - 12));
  let top = position.y - 12;
  top = Math.max(12, Math.min(top, vh - 160));

  const isDark = theme === "dark";

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed z-[200] w-[200px] overflow-hidden rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl",
        isDark
          ? "border-white/10 bg-[#1a1a1a]/95 text-white shadow-black/40"
          : "border-black/10 bg-white/95 text-black shadow-black/10",
      )}
      style={{
        left,
        top,
      }}
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
          <div
            key={`${index}-${line.label}`}
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
            <span className="shrink-0 tabular-nums font-medium">
              <TooltipText value={line.value} />
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
