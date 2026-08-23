import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import type {
  AttentionReason,
  PaneAttention,
} from "@/features/agent/store/agent-attention-store";
import { spaceIdFromTmuxWindowName } from "@/features/terminal/store/terminal-store-helpers";

export function spaceIdFromStablePaneId(stablePaneId: string): string {
  const tmux = stablePaneId.includes(":")
    ? stablePaneId.slice(stablePaneId.indexOf(":") + 1)
    : "";
  return spaceIdFromTmuxWindowName(tmux);
}

function reasonRank(reason: AttentionReason): number {
  return reason === "permission_request" ? 2 : 1;
}

/** Highest-urgency attention per center space of one host workspace/project. */
export function hostSpaceAttentionReasons(
  panes: Iterable<PaneAttention>,
  hostId: string,
): Record<string, AttentionReason> {
  const out: Record<string, AttentionReason> = {};
  if (!hostId) return out;
  for (const pane of panes) {
    if (hostIdFromCenterKey(pane.contextId) !== hostId) continue;
    const spaceId = spaceIdFromStablePaneId(pane.stablePaneId);
    const current = out[spaceId];
    if (!current || reasonRank(pane.reason) > reasonRank(current)) {
      out[spaceId] = pane.reason;
    }
  }
  return out;
}

/** Attention that is not on the currently visible space. */
export function offActiveSpaceAttentionReason(
  reasonsBySpace: Record<string, AttentionReason>,
  activeSpaceId: string,
): AttentionReason | null {
  let best: AttentionReason | null = null;
  for (const [spaceId, reason] of Object.entries(reasonsBySpace)) {
    if (spaceId === activeSpaceId) continue;
    if (!best || reasonRank(reason) > reasonRank(best)) best = reason;
  }
  return best;
}
