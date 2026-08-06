"use client";

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@workspace/ui";
import { Orb, type OrbVariant } from "@/features/agent/components/orbs/Orb";
import {
  isOrbIndicatorId,
  RANDOM_UNICODE_ID,
  UNICODE_SPINNER_IDS,
  type AgentActivityIndicatorId,
  type UnicodeSpinnerId,
} from "@/features/agent/lib/agent-activity-indicator-styles";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const BRAILLE_INTERVAL = 80;

type SpinnerData = { frames: readonly string[]; interval: number };

function pickUnicodeName(id: AgentActivityIndicatorId): UnicodeSpinnerId {
  if (id === RANDOM_UNICODE_ID) {
    return UNICODE_SPINNER_IDS[Math.floor(Math.random() * UNICODE_SPINNER_IDS.length)];
  }
  if ((UNICODE_SPINNER_IDS as readonly string[]).includes(id)) {
    return id as UnicodeSpinnerId;
  }
  return "braille";
}

function useUnicodeSpinner(id: AgentActivityIndicatorId, animated: boolean): string {
  const [frame, setFrame] = useState(0);
  const [spinner, setSpinner] = useState<SpinnerData | null>(null);

  // Stable while `id` is unchanged; re-roll only when id becomes "random" again.
  const resolvedName = useMemo(() => pickUnicodeName(id), [id]);

  useEffect(() => {
    // Fast path for the classic braille compact indicator.
    if (resolvedName === "braille") {
      setSpinner({ frames: BRAILLE_FRAMES, interval: BRAILLE_INTERVAL });
      return;
    }

    let cancelled = false;
    import("unicode-animations").then((mod) => {
      if (cancelled) return;
      const spinners = (mod.default ?? mod) as Record<string, SpinnerData | undefined>;
      const s = spinners[resolvedName];
      if (s?.frames?.length) setSpinner(s);
      else setSpinner({ frames: BRAILLE_FRAMES, interval: BRAILLE_INTERVAL });
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedName]);

  useEffect(() => {
    if (!spinner || !animated) return;
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner, animated]);

  if (!spinner) return BRAILLE_FRAMES[0];
  // Paused picker tiles stay on the first frame — avoids dozens of intervals.
  if (!animated) return spinner.frames[0] ?? BRAILLE_FRAMES[0];
  return spinner.frames[frame % spinner.frames.length] ?? BRAILLE_FRAMES[0];
}

export interface AgentRunningGlyphProps {
  styleId: AgentActivityIndicatorId;
  /**
   * `compact` — sidebar / tab / footer icon slot (~20px).
   * `full` — terminal pane status next to shimmer text (~14px glyph).
   */
  density?: "compact" | "full";
  /**
   * When false, show a still first frame (unicode) or CSS-paused Orb.
   * Use in dense pickers so only the active option pays for continuous animation.
   */
  animated?: boolean;
  /**
   * Optional pixel edge for Orbs (and matching host box). Overrides density defaults.
   * Useful in settings pickers where Orb geometry needs a slight optical bump
   * to sit next to mono unicode spinners.
   */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Renders only the animated running glyph (unicode spinner or AIcss Orb).
 * Permission / idle states stay in AgentHookStatusIndicator.
 */
export function AgentRunningGlyph({
  styleId,
  density = "compact",
  animated = true,
  size: sizeOverride,
  className,
  title,
}: AgentRunningGlyphProps) {
  if (isOrbIndicatorId(styleId)) {
    // Compact host is size-5 (20px); fill it so Orbs read closer to unicode mono glyphs.
    const size = sizeOverride ?? (density === "full" ? 14 : 20);
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground/80",
          sizeOverride
            ? undefined
            : density === "compact"
              ? "size-5"
              : "size-[14px]",
          className,
        )}
        style={sizeOverride ? { width: size, height: size } : undefined}
        title={title}
      >
        <Orb
          variant={styleId as OrbVariant}
          size={size}
          // animation-play-state is inherited; freezes all descendant keyframes.
          style={animated ? undefined : { animationPlayState: "paused" }}
        />
      </span>
    );
  }

  return (
    <UnicodeRunningGlyph
      styleId={styleId}
      density={density}
      animated={animated}
      className={className}
      title={title}
    />
  );
}

function UnicodeRunningGlyph({
  styleId,
  density,
  animated,
  className,
  title,
}: {
  styleId: AgentActivityIndicatorId;
  density: "compact" | "full";
  animated: boolean;
  className?: string;
  title?: string;
}) {
  const spinnerChar = useUnicodeSpinner(styleId, animated);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-mono leading-none text-muted-foreground/80 dark:text-muted-foreground",
        density === "compact" ? "size-5 text-sm" : "text-[11px]",
        className,
      )}
      title={title}
    >
      {spinnerChar}
    </span>
  );
}
