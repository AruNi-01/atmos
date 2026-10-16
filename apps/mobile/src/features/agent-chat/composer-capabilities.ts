import type { AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { contextUsageStats } from "./composer-cards";
import { copy } from "./copy";

export type ComposerCapability =
  | "attachments"
  | "paste"
  | "slash"
  | "mention"
  | "mode"
  | "permission"
  | "model"
  | "thinking"
  | "fast"
  | "contextTrigger"
  | "queue"
  | "steer"
  | "stop"
  | "microphone";

/** Phone composer surface. Dictation is intentionally absent. */
export function composerCapabilities(): Record<ComposerCapability, boolean> {
  return {
    attachments: true,
    paste: true,
    slash: true,
    mention: true,
    mode: true,
    permission: true,
    model: true,
    thinking: true,
    fast: true,
    contextTrigger: true,
    queue: true,
    steer: true,
    stop: true,
    microphone: false,
  };
}

/**
 * Visible label for the context trigger.
 * Null when the context card would not be in the lane.
 * Percent when usage can be measured, otherwise "Context".
 */
export function contextTriggerLabel(usage: AgentSessionUsage | null | undefined): string | null {
  const stats = contextUsageStats(usage ?? null);
  if (!stats) return null;
  const percent = Math.round(stats.percent);
  if (!Number.isFinite(percent)) return copy.context;
  return `${percent}%`;
}
