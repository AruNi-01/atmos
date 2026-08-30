"use client";

import {
  ActivityIndicator,
  ActivityIndicatorGroup,
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

  return (
    <div className="px-1 py-1.5">
      <ActivityIndicator
        style={thinking ? "stars" : "random"}
        random={thinking ? undefined : STREAM_ORB_GROUPS}
        size={20}
        label={`${activity.label}...`}
        trailing={
          <span className="translate-y-px font-mono text-xs tabular-nums text-muted-foreground">
            {formatWorkDuration(elapsedMs)}
          </span>
        }
      />
    </div>
  );
}
