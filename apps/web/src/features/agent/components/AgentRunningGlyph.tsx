"use client";

import {
  ActivityIndicator,
  ActivityIndicatorGroup,
} from "@workspace/ui";
import {
  RANDOM_UNICODE_ID,
  type AgentActivityIndicatorId,
} from "@/features/agent/lib/agent-activity-indicator-styles";

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
 * Running glyph for occupancy chrome (sidebar / tabs / footer / settings).
 * Persisted `"random"` stays unicode-only so existing settings don't change.
 */
export function AgentRunningGlyph({
  styleId,
  density = "compact",
  animated = true,
  size: sizeOverride,
  className,
  title,
}: AgentRunningGlyphProps) {
  const size = sizeOverride ?? (density === "full" ? 14 : 20);
  const randomUnicode = styleId === RANDOM_UNICODE_ID;
  return (
    <ActivityIndicator
      style={randomUnicode ? "random" : styleId}
      random={randomUnicode ? [ActivityIndicatorGroup.Unicode] : undefined}
      size={size}
      animated={animated}
      title={title}
      className={className}
    />
  );
}
