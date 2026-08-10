"use client";

import { cn } from "@/lib/utils";

import "./image-generation.css";

export type ImageGenerationCanvasProps = {
  /** Optional resolution badge (e.g. "1536 × 1024"). Omit to hide. */
  resolution?: string;
  /** Explicit theme; falls back to app/system dark detection. */
  theme?: "light" | "dark";
  className?: string;
  /** Accessible label for the generating canvas. */
  "aria-label"?: string;
};

/**
 * AIcss Image Generation canvas placeholder (dots + morphing glow).
 * Canvas-only — no "Generating image" / prompt meta.
 *
 * @see https://www.aicss.dev/components/image-generation
 */
export function ImageGenerationCanvas({
  resolution,
  theme,
  className,
  "aria-label": ariaLabel = "Generating image",
}: ImageGenerationCanvasProps) {
  return (
    <div
      className={cn("ig-canvas", className)}
      data-theme={theme}
      role="img"
      aria-label={ariaLabel}
      aria-busy="true"
    >
      <span className="ig-dots" aria-hidden />
      <span className="ig-glow" aria-hidden />
      {resolution ? <span className="ig-res">{resolution}</span> : null}
    </div>
  );
}
