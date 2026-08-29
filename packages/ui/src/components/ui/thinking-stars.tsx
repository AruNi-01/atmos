"use client";

/**
 * Stars glyph from BoardUI Agent Thinking.
 * https://www.boardui.com/components/agent-thinking
 */

import { cn } from "@/lib/utils";
import "./thinking-stars.css";

const STAR_PERIOD_S = 1.4;
const STAR_SIZE = 14;
const STAR_COUNT = 5;
const STAR_LAYOUT = [
  { x: 50, y: 46, scale: 1 },
  { x: 18, y: 22, scale: 0.55 },
  { x: 82, y: 26, scale: 0.45 },
  { x: 78, y: 76, scale: 0.55 },
  { x: 22, y: 78, scale: 0.4 },
] as const;
const STAR_PATH =
  "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";

export function ThinkingStars({
  className,
  size,
  animated = true,
}: {
  className?: string;
  /** Host box edge. Defaults to the BoardUI 21px cluster. */
  size?: number;
  animated?: boolean;
}) {
  const box = size ?? STAR_SIZE * 1.5;
  const base = box / 1.5;
  return (
    <span
      aria-hidden
      data-animated={animated ? undefined : "false"}
      className={cn("thinking-stars relative block shrink-0", className)}
      style={{ width: box, height: box }}
    >
      {STAR_LAYOUT.slice(0, STAR_COUNT).map((star, i) => {
        const starSize = base * star.scale;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="thinking-stars-star absolute"
            style={{
              width: starSize,
              height: starSize,
              left: `${star.x}%`,
              top: `${star.y}%`,
              marginLeft: -starSize / 2,
              marginTop: -starSize / 2,
              animationDuration: `${STAR_PERIOD_S}s`,
              animationDelay: `${(i * STAR_PERIOD_S * 0.7) / STAR_COUNT}s`,
            }}
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        );
      })}
    </span>
  );
}
