"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import { cn } from "../../lib/utils";
import {
  clamp,
  hash,
  smoothstep,
  type DitherTheme,
} from "../../lib/dither/math";
import { useDitherCanvas } from "../../lib/dither/use-dither-canvas";

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
  const valueTextRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const valueSpring = useSpring(valueRef.current, {
    stiffness: 120,
    damping: 20,
    mass: 0.8,
  });
  useEffect(() => {
    valueSpring.set(valueRef.current);
  }, [value, valueSpring]);
  const colorRef = useRef(color);
  colorRef.current = color;
  const trackRef = useRef(trackColor);
  trackRef.current = trackColor;
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;

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
      const currentValue = clamp(
        reducedMotion ? valueRef.current : valueSpring.get(),
        0,
        100,
      );
      if (valueTextRef.current) {
        valueTextRef.current.textContent = formatRef.current(currentValue);
      }

      const cx = width / 2;
      const cy = height * 0.82;
      const rOut = Math.max(20, Math.min(width * 0.44, height * 0.7));
      const thickness = Math.max(10, Math.min(16, rOut * 0.16));
      const rIn = Math.max(1, rOut - thickness);
      const startAngle = Math.PI;
      const endAngle = Math.PI * 2;
      const valueAngle = startAngle + (currentValue / 100) * Math.PI;

      ctx.beginPath();
      ctx.arc(cx, cy, rOut, startAngle, endAngle);
      ctx.arc(cx, cy, rIn, endAngle, startAngle, true);
      ctx.closePath();
      ctx.globalAlpha = theme === "dark" ? 0.42 : 0.54;
      ctx.fillStyle = trackRef.current;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (currentValue > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, startAngle, valueAngle);
        ctx.arc(cx, cy, rIn, valueAngle, startAngle, true);
        ctx.closePath();
        ctx.clip();

        const cell = Math.max(2.4, Math.min(4, width / 58));
        for (let x = Math.floor(cx - rOut); x <= Math.ceil(cx + rOut); x += cell) {
          for (let y = Math.floor(cy - rOut); y <= Math.ceil(cy); y += cell) {
            const centerX = x + cell / 2;
            const centerY = y + cell / 2;
            const dx = centerX - cx;
            const dy = centerY - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < rIn - cell || distance > rOut + cell) continue;

            const noise = hash(centerX, centerY);
            const waveRaw = reducedMotion
              ? 0
              : Math.sin(centerX * 0.05 + time * 4) +
                Math.sin(centerY * 0.05 + time * 2.8);
            const wave = smoothstep(-1.5, 1.5, waveRaw);
            const size =
              cell * (0.42 + 0.38 * wave) * (0.82 + 0.34 * noise);
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = colorRef.current;
            ctx.fillRect(
              x + (cell - size) / 2,
              y + (cell - size) / 2,
              size,
              size,
            );
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    [theme, valueSpring],
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
      <canvas ref={canvasRef} className="block h-28 w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-[52%] text-center">
        <div
          ref={valueTextRef}
          className="text-sm font-semibold tabular-nums text-foreground"
        >
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
