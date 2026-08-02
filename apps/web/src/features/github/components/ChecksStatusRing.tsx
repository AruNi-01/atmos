"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import type { StatusCheck } from "@/features/github/lib/pr-detail-parts";

/** Only three visual tones, ordered for drawing: green → gray → red. */
type RingTone = "success" | "neutral" | "failure";

const TONE_COLOR: Record<RingTone, string> = {
  success: "#10b981",
  neutral: "#71717a",
  failure: "#ef4444",
};

const DRAW_ORDER: RingTone[] = ["success", "neutral", "failure"];

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
  // Skipped / pending / in-progress / neutral → gray band (only 3 colors total)
  if (
    conclusion === "SKIPPED" ||
    conclusion === "NEUTRAL" ||
    conclusion === "CANCELLED" ||
    conclusion === "STALE" ||
    state === "PENDING" ||
    state === "IN_PROGRESS" ||
    state === "EXPECTED" ||
    state === "QUEUED" ||
    (status && status !== "COMPLETED")
  ) {
    return "neutral";
  }
  return "neutral";
}

/**
 * GitHub-style status ring: same colors are grouped into continuous arcs.
 * Draw order: green (success) → gray (skipped/pending) → red (failure).
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
  const counts = React.useMemo(() => {
    const next: Record<RingTone, number> = {
      success: 0,
      neutral: 0,
      failure: 0,
    };
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

  const total = Math.max(
    counts.success + counts.neutral + counts.failure,
    1,
  );

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Gap between color groups (only between non-empty bands)
  const nonEmpty = DRAW_ORDER.filter((tone) => counts[tone] > 0);
  const gapPx =
    nonEmpty.length > 1
      ? Math.min(2.5, circumference / nonEmpty.length / 8)
      : 0;
  const usable = circumference - gapPx * nonEmpty.length;

  // Build contiguous arcs in draw order
  const arcs = React.useMemo(() => {
    const result: Array<{ tone: RingTone; length: number; rotation: number }> =
      [];
    let cursorDeg = 0;
    for (const tone of DRAW_ORDER) {
      const count = counts[tone];
      if (count <= 0) continue;
      const length = (count / total) * usable;
      result.push({ tone, length, rotation: cursorDeg });
      const spanDeg = ((length + gapPx) / circumference) * 360;
      cursorDeg += spanDeg;
    }
    return result;
  }, [counts, total, usable, gapPx, circumference]);

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
      {arcs.map(({ tone, length, rotation }) => (
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
          transform={`rotate(${rotation} ${cx} ${cy})`}
        />
      ))}
    </svg>
  );
}
