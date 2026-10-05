"use client";

import { useMemo } from "react";
import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import { AGENT_TOOL_ICON_IDS } from "@/features/agent/store/agent-status-store";
import {
  historyRefreshKey,
  observerHistoryRequest,
  splitSessionHistory,
} from "@/features/agent/lib/observer-session-history";
import { ObserverEventPreview } from "./ObserverEventPreview";
import { ObserverSessionTranscript } from "./ObserverSessionTranscript";
import { useObserverSessionHistory } from "./use-observer-session-history";

export function ObserverHistory({
  activity,
  filesLabel,
  emptyLabel,
  loadingLabel,
  onOpenChild,
}: {
  activity: AgentActivity;
  filesLabel?: (count: number) => string;
  emptyLabel?: string;
  loadingLabel?: string;
  onOpenChild?: (childId: string) => void;
}) {
  const request = useMemo(
    () => observerHistoryRequest(activity),
    [
      activity.surface,
      activity.session_id,
      activity.surface_id,
      activity.host_provider_id,
      activity.native_session_id,
      activity.tool,
    ],
  );
  const refreshKey = historyRefreshKey(activity);
  const { messages, loading } = useObserverSessionHistory(request, refreshKey);
  const split = useMemo(
    () => splitSessionHistory(messages ?? [], activity.turns ?? [], activity.children ?? []),
    [activity.children, activity.turns, messages],
  );
  const showTranscript = (messages?.length ?? 0) > 0 && split.messages.length > 0;
  const hookIds = showTranscript ? split.hookTurnIds : undefined;
  const waiting = loading && messages == null && (activity.turns ?? []).length === 0;

  if (waiting) {
    return loadingLabel
      ? <p className="px-1 text-sm text-muted-foreground">{loadingLabel}</p>
      : null;
  }

  const knownChild = (id: string) => (activity.children ?? []).some((child) => child.child_id === id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showTranscript ? (
        <div className={hookIds && hookIds.length > 0 ? "min-h-0 flex-1" : "h-full min-h-0"}>
          <ObserverSessionTranscript
            messages={split.messages}
            cwd={activity.project_path?.trim() || ""}
            registryId={AGENT_TOOL_ICON_IDS[activity.tool] ?? activity.tool}
            subagentCardMode={request?.kind === "chat" ? "live" : "transcript"}
            onOpenChild={(id) => {
              if (knownChild(id)) onOpenChild?.(id);
            }}
          />
        </div>
      ) : null}
      {showTranscript && hookIds && hookIds.length > 0 ? (
        <div className="max-h-[45%] min-h-0 shrink-0 overflow-y-auto border-t border-border/60 [&_[data-observer-scroll]]:h-auto [&_[data-observer-scroll]]:overflow-visible">
          <ObserverEventPreview
            activity={activity}
            turnIds={hookIds}
            filesLabel={filesLabel}
            onOpenChild={onOpenChild}
          />
        </div>
      ) : null}
      {!showTranscript ? (
        <div className="min-h-0 flex-1">
          <ObserverEventPreview
            activity={activity}
            filesLabel={filesLabel}
            emptyLabel={emptyLabel}
            onOpenChild={onOpenChild}
          />
        </div>
      ) : null}
    </div>
  );
}
