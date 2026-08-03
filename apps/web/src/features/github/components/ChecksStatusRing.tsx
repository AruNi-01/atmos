"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import type { StatusCheck } from "@/features/github/lib/pr-detail-parts";

/** Four visual tones, draw order: green → yellow → gray → red. */
type RingTone = "success" | "running" | "neutral" | "failure";

const TONE_COLOR: Record<RingTone, string> = {
  success: "#10b981",
  running: "#f59e0b",
  neutral: "#71717a",
  failure: "#ef4444",
};

const DRAW_ORDER: RingTone[] = ["success", "running", "neutral", "failure"];

const EMPTY_COUNTS: Record<RingTone, number> = {
  success: 0,
  running: 0,
  neutral: 0,
  failure: 0,
};

const ANIM_MS = 520;
const ANIM_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function toneForCheck(check: StatusCheck): RingTone {
  const state = (check.state || "").toUpperCase();
  const conclusion = (check.conclusion || "").toUpperCase();
  const status = (check.status || "").toUpperCase();

  if (
    state === "FAILURE" ||
    state === "ERROR" ||
    conclusion === "FAILURE" ||
    conclusion === "ERROR" ||
    conclusion === "ACTION_REQUIRED" ||
    conclusion === "TIMED_OUT" ||
    conclusion === "STARTUP_FAILURE"
  ) {
    return "failure";
  }
  if (state === "SUCCESS" || conclusion === "SUCCESS") {
    return "success";
  }
  // In-progress / pending / queued → yellow running band
  if (
    state === "PENDING" ||
    state === "IN_PROGRESS" ||
    state === "EXPECTED" ||
    state === "QUEUED" ||
    (status && status !== "COMPLETED")
  ) {
    return "running";
  }
  // Skipped / cancelled / neutral / stale → gray band
  if (
    conclusion === "SKIPPED" ||
    conclusion === "NEUTRAL" ||
    conclusion === "CANCELLED" ||
    conclusion === "STALE"
  ) {
    return "neutral";
  }
  return "neutral";
}

type ArcVisual = {
  tone: RingTone;
  length: number;
  rotation: number;
  visible: boolean;
};

function buildArcs(
  counts: Record<RingTone, number>,
  circumference: number,
): ArcVisual[] {
  const total = Math.max(
    counts.success + counts.running + counts.neutral + counts.failure,
    1,
  );
  const nonEmpty = DRAW_ORDER.filter((tone) => counts[tone] > 0);
  const gapPx =
    nonEmpty.length > 1
      ? Math.min(2.5, circumference / nonEmpty.length / 8)
      : 0;
  const usable = circumference - gapPx * nonEmpty.length;

  let cursorDeg = 0;
  return DRAW_ORDER.map((tone) => {
    const count = counts[tone];
    if (count <= 0) {
      return { tone, length: 0, rotation: cursorDeg, visible: false };
    }
    const length = (count / total) * usable;
    const arc: ArcVisual = {
      tone,
      length,
      rotation: cursorDeg,
      visible: true,
    };
    const spanDeg = ((length + gapPx) / circumference) * 360;
    cursorDeg += spanDeg;
    return arc;
  });
}

/**
 * Lerp display counts toward the latest target so arc lengths / rotations
 * ease instead of snapping when check rollup updates.
 */
function useAnimatedCounts(
  target: Record<RingTone, number>,
): Record<RingTone, number> {
  const [display, setDisplay] = React.useState(target);
  const displayRef = React.useRef(display);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<{
    from: Record<RingTone, number>;
    to: Record<RingTone, number>;
    t0: number;
  } | null>(null);

  React.useEffect(() => {
    displayRef.current = display;
  }, [display]);

  React.useEffect(() => {
    const from = { ...displayRef.current };
    const to = { ...target };
    const unchanged = DRAW_ORDER.every((tone) => from[tone] === to[tone]);
    if (unchanged) return;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }

    startRef.current = { from, to, t0: performance.now() };

    const tick = (now: number) => {
      const start = startRef.current;
      if (!start) return;
      const t = Math.min(1, (now - start.t0) / ANIM_MS);
      // ease-out cubic — snappy start, soft landing
      const eased = 1 - Math.pow(1 - t, 3);
      const next: Record<RingTone, number> = { ...EMPTY_COUNTS };
      for (const tone of DRAW_ORDER) {
        next[tone] = start.from[tone] + (start.to[tone] - start.from[tone]) * eased;
      }
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
        startRef.current = null;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target]);

  return display;
}

/**
 * GitHub-style status ring: same colors are grouped into continuous arcs.
 * Draw order: green (success) → yellow (running) → gray (skipped) → red (failure).
 * Arc proportions animate when the check mix changes.
 */
export function ChecksStatusRing({
  checks,
  className,
  size = 28,
  strokeWidth = 3.5,
  hasConflicts = false,
}: {
  checks: StatusCheck[];
  className?: string;
  size?: number;
  strokeWidth?: number;
  hasConflicts?: boolean;
}) {
  const targetCounts = React.useMemo(() => {
    const next: Record<RingTone, number> = { ...EMPTY_COUNTS };
    if (checks.length === 0) {
      next.neutral = 1;
      return next;
    }
    for (const check of checks) {
      next[toneForCheck(check)] += 1;
    }
    // Conflicts tip the ring toward failure if there were no failing checks yet.
    if (hasConflicts && next.failure === 0) {
      next.failure = 1;
    }
    return next;
  }, [checks, hasConflicts]);

  const counts = useAnimatedCounts(targetCounts);

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = React.useMemo(
    () => buildArcs(counts, circumference),
    [counts, circumference],
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
      aria-hidden
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-border/40"
      />
      {arcs.map(({ tone, length, rotation, visible }) => (
        <circle
          key={tone}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={TONE_COLOR[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={`${length} ${Math.max(circumference - length, 0)}`}
          // Keep zero-length arcs mounted so length/rotation can ease in/out.
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            opacity: visible || length > 0.05 ? 1 : 0,
            transition: `opacity ${ANIM_MS * 0.55}ms ${ANIM_EASING}`,
            pointerEvents: "none",
          }}
        />
      ))}
    </svg>
  );
}
