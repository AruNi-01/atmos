"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import type { StatusCheck } from "@/features/github/lib/pr-detail-parts";

type SegmentTone = "success" | "failure" | "pending" | "skipped" | "empty";

const TONE_COLOR: Record<SegmentTone, string> = {
  success: "#10b981",
  failure: "#ef4444",
  pending: "#f59e0b",
  skipped: "#71717a",
  empty: "#3f3f46",
};

function toneForCheck(check: StatusCheck): SegmentTone {
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
  if (
    conclusion === "SKIPPED" ||
    conclusion === "NEUTRAL" ||
    conclusion === "CANCELLED" ||
    conclusion === "STALE"
  ) {
    return "skipped";
  }
  if (
    state === "PENDING" ||
    state === "IN_PROGRESS" ||
    state === "EXPECTED" ||
    state === "QUEUED" ||
    (status && status !== "COMPLETED")
  ) {
    return "pending";
  }
  return "skipped";
}

/**
 * GitHub-style multi-segment status ring: one arc per check, colored by outcome.
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
  const tones = React.useMemo(() => {
    if (checks.length === 0) return ["empty" as SegmentTone];
    return checks.map(toneForCheck);
  }, [checks]);

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const n = Math.max(tones.length, 1);
  const gapPx = n > 1 ? Math.min(2.5, circumference / n / 5) : 0;
  const segmentLen = (circumference - gapPx * n) / n;

  const hasFailure = tones.includes("failure") || hasConflicts;
  const hasPending = tones.includes("pending");
  const allSuccess =
    tones.length > 0 && tones.every((t) => t === "success" || t === "skipped");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
      aria-hidden
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-border/50"
      />
      {tones.map((tone, index) => {
        const color =
          hasConflicts && tone !== "failure"
            ? TONE_COLOR.pending
            : TONE_COLOR[tone];
        const rotation = (index / n) * 360;
        return (
          <circle
            key={`${tone}-${index}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={`${segmentLen} ${circumference - segmentLen}`}
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(1.5, radius - strokeWidth - 1)}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.75}
        className={cn(
          "rotate-90 origin-center",
          hasFailure
            ? "text-red-500/25"
            : hasPending || hasConflicts
              ? "text-amber-500/25"
              : allSuccess
                ? "text-emerald-500/25"
                : "text-border/30",
        )}
      />
    </svg>
  );
}
