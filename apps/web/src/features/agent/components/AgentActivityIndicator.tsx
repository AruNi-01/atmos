"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  ActivityIndicator,
  ActivityIndicatorGroup,
  SlidingNumber,
  TextShimmer,
  pickActivityIndicatorStyle,
} from "@workspace/ui";
import type { AgentActivity } from "../lib/chat-helpers";
import { formatWorkDuration, workDurationParts } from "../lib/agent-chat-timing";

const STREAM_ORB_GROUPS = [
  ActivityIndicatorGroup.Lattice,
  ActivityIndicatorGroup.Ring,
  ActivityIndicatorGroup.Helix,
] as const;

/**
 * Orb/stars fill a shared `size-4` slot with session-lifecycle / tool headers.
 * 20px (default ActivityIndicator) keeps lattice/ring optical weight; the
 * slot centers it so left edges match lucide `size-4` chrome.
 */
const GLYPH_SIZE = 20;
const CLOCK_CLASS =
  "inline-flex items-baseline font-mono text-sm tabular-nums leading-none text-muted-foreground";

function DurationUnit({ value, unit }: { value: number; unit: "h" | "m" | "s" }) {
  return (
    <span className="inline-flex items-baseline">
      <SlidingNumber value={value} />
      <span>{unit}</span>
    </span>
  );
}

function WorkDurationClock({
  elapsedMs,
  reduced,
}: {
  elapsedMs: number;
  reduced: boolean;
}) {
  const label = formatWorkDuration(elapsedMs);
  if (reduced) {
    return (
      <span className={CLOCK_CLASS} role="timer">
        {label}
      </span>
    );
  }

  const { hours, minutes, seconds } = workDurationParts(elapsedMs);
  return (
    <span className={CLOCK_CLASS} role="timer" aria-label={label}>
      {hours > 0 ? <DurationUnit key="h" value={hours} unit="h" /> : null}
      {hours > 0 || minutes > 0 ? <DurationUnit key="m" value={minutes} unit="m" /> : null}
      <DurationUnit key="s" value={seconds} unit="s" />
    </span>
  );
}

export function AgentActivityIndicator({
  activity,
  elapsedMs = 0,
}: {
  activity: AgentActivity & { busy: true };
  elapsedMs?: number;
}) {
  const thinking = activity.kind === "thinking";
  const label = activity.trail === "none" ? activity.label : `${activity.label}...`;
  const reduced = Boolean(useReducedMotion());
  const [streamStyle] = useState(() => pickActivityIndicatorStyle(STREAM_ORB_GROUPS));
  const glyphStyle = thinking ? "stars" : streamStyle;

  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center overflow-visible">
        <ActivityIndicator
          style={glyphStyle}
          size={GLYPH_SIZE}
        />
      </span>
      <span className="relative flex h-5 min-w-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={reduced ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex min-w-0 max-w-full items-center overflow-hidden"
          >
            <TextShimmer
              as="span"
              className="block max-w-full truncate text-sm leading-5"
              duration={1.5}
            >
              {label}
            </TextShimmer>
          </motion.span>
        </AnimatePresence>
      </span>
      <WorkDurationClock elapsedMs={elapsedMs} reduced={reduced} />
    </div>
  );
}
