import type { AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";

export type ContextWindowStats = {
  used: number;
  context_window: number;
  percent: number;
};

function contextWindowTotal(
  usage: AgentSessionUsage | null | undefined,
): number | null {
  if (usage == null) return null;
  const window = usage.context_window ?? usage.size ?? null;
  if (window == null || window <= 0) return null;
  return window;
}

/** True when the session reports a usable context window (used + positive window). */
export function hasContextWindowStats(
  usage: AgentSessionUsage | null | undefined,
): usage is AgentSessionUsage & { used: number } {
  return (
    usage != null
    && usage.used != null
    && contextWindowTotal(usage) != null
  );
}

export function contextWindowStats(
  usage: AgentSessionUsage | null | undefined,
): ContextWindowStats | null {
  if (!hasContextWindowStats(usage)) return null;
  const used = usage.used;
  const context_window = contextWindowTotal(usage)!;
  const percent = Math.min(100, Math.max(0, (used / context_window) * 100));
  return { used, context_window, percent };
}

/** Compact token counts for UI: `114k`, `1M`, or plain integers. */
export function formatCompactTokenCount(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const thousands = n / 1000;
    if (thousands >= 100) return `${Math.round(thousands)}k`;
    return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  }
  return String(n);
}

export type ContextWindowBarTone = "default" | "warning";

/** Yellow warning at ≥70%; otherwise theme foreground (no blue). */
export function contextWindowBarTone(percent: number): ContextWindowBarTone {
  return percent >= 70 ? "warning" : "default";
}

/** Merge a `context_usage_updated` payload into session usage state. */
export function mergeContextUsageUpdate(
  existing: AgentSessionUsage | null | undefined,
  update: { used: number; context_window?: number | null },
): AgentSessionUsage {
  return {
    ...(existing ?? {}),
    used: update.used,
    context_window:
      update.context_window
      ?? existing?.context_window
      ?? existing?.size
      ?? null,
    size: undefined,
  };
}
