"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  ActivityIndicator,
  ActivityIndicatorGroup,
  TextShimmer,
  pickActivityIndicatorStyle,
} from "@workspace/ui";
import type { AgentActivity } from "../lib/chat-helpers";
import { formatWorkDuration } from "../lib/agent-chat-timing";

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

export function AgentActivityIndicator({
  activity,
  elapsedMs = 0,
}: {
  activity: AgentActivity & { busy: true };
  elapsedMs?: number;
}) {
  const thinking = activity.kind === "thinking";
  const label = `${activity.label}...`;
  const reduced = Boolean(useReducedMotion());
  const [streamStyle] = useState(() => pickActivityIndicatorStyle(STREAM_ORB_GROUPS));
  const glyphStyle = thinking ? "stars" : streamStyle;

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center overflow-visible">
        <ActivityIndicator
          style={glyphStyle}
          size={GLYPH_SIZE}
        />
      </span>
      <span className="relative inline-flex h-5 min-w-0 items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={reduced ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="inline-flex items-center"
          >
            <TextShimmer as="span" className="text-sm leading-5" duration={1.5}>
              {label}
            </TextShimmer>
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="font-mono text-sm tabular-nums leading-5 text-muted-foreground">
        {formatWorkDuration(elapsedMs)}
      </span>
    </div>
  );
}
