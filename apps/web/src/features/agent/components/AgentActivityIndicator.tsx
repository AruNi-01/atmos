"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  ActivityIndicator,
  ActivityIndicatorGroup,
  TextEffect,
  pickActivityIndicatorStyle,
  textEffectBlurSlideVariants,
} from "@workspace/ui";
import type { AgentActivity } from "../lib/chat-helpers";
import { formatWorkDuration } from "../lib/agent-chat-timing";

const STREAM_ORB_GROUPS = [
  ActivityIndicatorGroup.Lattice,
  ActivityIndicatorGroup.Ring,
  ActivityIndicatorGroup.Helix,
] as const;

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
  const [shimmering, setShimmering] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setShimmering(true);
      return;
    }
    setShimmering(false);
    const enterMs = 400 + (label.length + 1) * 10;
    const timer = window.setTimeout(() => setShimmering(true), enterMs);
    return () => window.clearTimeout(timer);
  }, [label, reduced]);

  const glyph = (
    <ActivityIndicator
      style={glyphStyle}
      size={20}
    />
  );

  return (
    <div className="overflow-visible px-1 py-1.5">
      <span className="inline-flex items-center gap-2 overflow-visible text-muted-foreground">
        {shimmering ? (
          <ActivityIndicator
            style={glyphStyle}
            size={20}
            label={label}
            shimmer
          />
        ) : (
          <TextEffect
            as="span"
            className="inline-flex items-center text-sm"
            per="char"
            variants={textEffectBlurSlideVariants}
            segmentTransition={{ duration: 0.4 }}
            leading={glyph}
            leadingClassName="mr-2"
            segmentWrapperClassName="translate-y-px"
          >
            {label}
          </TextEffect>
        )}
        <span className="translate-y-px font-mono text-xs tabular-nums text-muted-foreground">
          {formatWorkDuration(elapsedMs)}
        </span>
      </span>
    </div>
  );
}
