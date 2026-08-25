"use client";

import { useCallback, useRef } from "react";
import { cn } from "../../lib/utils";
import { clamp, hash, type DitherTheme } from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";
import { smoothToward } from "../dither/DitherTooltip";

type GaugeMeterProps = {
  label: string;
  value: number;
  color: string;
  trackColor: string;
  theme: DitherTheme;
  formatValue: (value: number) => string;
};

function GaugeMeter({
  label,
  value,
  color,
  trackColor,
  theme,
  formatValue,
}: GaugeMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef(value);
  valueRef.current = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const displayedRef = useRef(valueRef.current);
  const colorRef = useRef(color);
  colorRef.current = color;
  const trackRef = useRef(trackColor);
  trackRef.current = trackColor;

  const draw = useCallback(
    ({
      ctx,
      width,
      height,
      time,
      reducedMotion,
    }: {
      ctx: CanvasRenderingContext2D;
      width: number;
      height: number;
      time: number;
      reducedMotion: boolean;
    }) => {
      displayedRef.current = reducedMotion
        ? valueRef.current
        : smoothToward(displayedRef.current, valueRef.current, 0.085);

      const cx = width / 2;
      const cy = height * 0.56;
      const radius = Math.max(12, Math.min(width * 0.38, height * 0.43));
      const start = Math.PI * 0.72;
      const sweep = Math.PI * 1.56;
      const segments = 54;
      const active = (displayedRef.current / 100) * (segments - 1);
      const baseSize = Math.max(2.2, Math.min(4.1, radius / 13));

      for (let index = 0; index < segments; index += 1) {
        const angle = start + (index / (segments - 1)) * sweep;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const filled = index <= active;
        const edge = Math.max(0, 1 - Math.abs(index - active));
        const wave = reducedMotion
          ? 0
          : Math.sin(index * 0.63 - time * 1.7) * 0.09;
        const noise = hash(index, Math.round(radius));
        const size = baseSize * (0.78 + noise * 0.18 + wave + edge * 0.08);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 4);
        ctx.fillStyle = filled ? colorRef.current : trackRef.current;
        ctx.globalAlpha = filled ? 0.9 : theme === "dark" ? 0.48 : 0.6;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    [theme],
  );

  useDitherCanvas(canvasRef, draw);

  return (
    <div
      className="relative min-w-0"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valueRef.current)}
    >
      <canvas ref={canvasRef} className="block h-20 w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
        <div className="text-sm font-semibold tabular-nums text-foreground">
          {formatValue(valueRef.current)}
        </div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export type ServerGaugeProps = {
  cpuPercent?: number;
  memoryPercent?: number;
  cpuLabel?: string;
  memoryLabel?: string;
  cpuColor?: string;
  memoryColor?: string;
  trackColor?: string;
  theme?: DitherTheme;
  className?: string;
  formatValue?: (value: number) => string;
};

/**
 * Compact dual server gauge adapted to Atmos' Amicro-derived Dither engine.
 * Values are real inputs; no demo data or second chart runtime is bundled.
 */
export function ServerGauge({
  cpuPercent = 0,
  memoryPercent = 0,
  cpuLabel = "CPU",
  memoryLabel = "Memory",
  cpuColor = "#5FCC74",
  memoryColor = "#5FCC74",
  trackColor,
  theme = "dark",
  className,
  formatValue = (value) => `${Math.round(value)}%`,
}: ServerGaugeProps) {
  const resolvedTrack =
    trackColor ?? (theme === "dark" ? "#47474C" : "#C3C3C9");
  return (
    <div
      className={cn("grid min-w-0 grid-cols-2 gap-2", className)}
      data-server-gauge=""
    >
      <GaugeMeter
        label={cpuLabel}
        value={cpuPercent}
        color={cpuColor}
        trackColor={resolvedTrack}
        theme={theme}
        formatValue={formatValue}
      />
      <GaugeMeter
        label={memoryLabel}
        value={memoryPercent}
        color={memoryColor}
        trackColor={resolvedTrack}
        theme={theme}
        formatValue={formatValue}
      />
    </div>
  );
}
