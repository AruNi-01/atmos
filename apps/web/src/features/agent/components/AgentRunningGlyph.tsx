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

function useUnicodeSpinner(id: AgentActivityIndicatorId): string {
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
    if (!spinner) return;
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner]);

  if (!spinner) return BRAILLE_FRAMES[0];
  return spinner.frames[frame % spinner.frames.length] ?? BRAILLE_FRAMES[0];
}

export interface AgentRunningGlyphProps {
  styleId: AgentActivityIndicatorId;
  /**
   * `compact` — sidebar / tab / footer icon slot (~20px).
   * `full` — terminal pane status next to shimmer text (~14px glyph).
   */
  density?: "compact" | "full";
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
  className,
  title,
}: AgentRunningGlyphProps) {
  if (isOrbIndicatorId(styleId)) {
    const size = density === "full" ? 14 : 18;
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground/80",
          density === "compact" ? "size-5" : "size-[14px]",
          className,
        )}
        title={title}
      >
        <Orb variant={styleId as OrbVariant} size={size} />
      </span>
    );
  }

  return (
    <UnicodeRunningGlyph
      styleId={styleId}
      density={density}
      className={className}
      title={title}
    />
  );
}

function UnicodeRunningGlyph({
  styleId,
  density,
  className,
  title,
}: {
  styleId: AgentActivityIndicatorId;
  density: "compact" | "full";
  className?: string;
  title?: string;
}) {
  const spinnerChar = useUnicodeSpinner(styleId);
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
