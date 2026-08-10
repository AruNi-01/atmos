"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface TerminalLoaderProps {
  rows?: number;
  cols?: number;
  blockWidth?: number;
  speed?: number;
  color?: string;
  bgColor?: string;
  charEmpty?: string;
  charTrail?: string[];
  className?: string;
}

/**
 * Retro terminal-inspired monospace loading indicator (Great UI / MIT).
 * https://great-ui.com
 */
export function TerminalLoader({
  rows = 5,
  cols = 60,
  blockWidth = 3,
  speed = 50,
  color = "text-foreground",
  bgColor = "bg-foreground",
  charEmpty = ".",
  charTrail = ["▓", "▒", "░"],
  className,
}: TerminalLoaderProps) {
  const [position, setPosition] = React.useState(0);
  const [direction, setDirection] = React.useState(1);

  React.useEffect(() => {
    let currentDir = 1;
    const interval = setInterval(() => {
      setPosition((prev) => {
        const next = prev + currentDir;
        if (next >= cols - blockWidth) {
          currentDir = -1;
          setDirection(-1);
          return cols - blockWidth - 1;
        }
        if (next <= 0) {
          currentDir = 1;
          setDirection(1);
          return 1;
        }
        return next;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [cols, blockWidth, speed]);

  const renderRow = () => {
    const chars = new Array(cols).fill(charEmpty);

    if (direction === 1) {
      for (let i = 0; i < charTrail.length; i++) {
        const idx = position - 1 - i;
        if (idx >= 0 && idx < cols) {
          chars[idx] = charTrail[i];
        }
      }
    } else {
      for (let i = 0; i < charTrail.length; i++) {
        const idx = position + blockWidth + i;
        if (idx >= 0 && idx < cols) {
          chars[idx] = charTrail[i];
        }
      }
    }

    return chars.join("");
  };

  const rowString = renderRow();

  return (
    <div
      className={cn(
        "relative inline-flex flex-col overflow-hidden font-mono text-sm leading-[0.9] tracking-[0.3em]",
        color,
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="whitespace-pre">
          {rowString}
        </div>
      ))}

      <div
        className={cn("absolute top-0 bottom-0", bgColor)}
        style={{
          width: `calc(${blockWidth} * (1ch + 0.3em))`,
          left: `calc(${position} * (1ch + 0.3em))`,
        }}
      />
    </div>
  );
}
