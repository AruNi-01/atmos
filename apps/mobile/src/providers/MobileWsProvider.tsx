import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TerminalTitleUpdatedNotification } from "@atmos/api-types/ws/dto/events";
import type { TerminalWorkspaceCandidate } from "@/api/types";
import { MobileWsClient, type MobileWsState } from "@/api/mobile-ws-client";
import { applyServerTerminalTitle } from "@/features/terminal/terminal-selection";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useUiStore } from "@/stores/ui-store";

type MobileWsContextValue = {
  client: MobileWsClient | null;
  state: MobileWsState;
};

const MobileWsContext = createContext<MobileWsContextValue>({
  client: null,
  state: "idle",
});

export function MobileWsProvider({ children }: PropsWithChildren) {
  const session = useSessionStore((state) => state.activeClientSession);
  const clearTerminalState = useTerminalStore((state) => state.clearAll);
  const setDisconnectedReason = useUiStore((state) => state.setDisconnectedReason);
  const [wsState, setWsState] = useState<MobileWsState>("idle");
  const previousSessionKeyRef = useRef<string | null | undefined>(undefined);

  const queryClient = useQueryClient();
  const client = useMemo(() => {
    if (!session?.ws_url) return null;
    return new MobileWsClient(session.ws_url);
  }, [session?.ws_url]);

  useEffect(() => {
    const nextSessionKey = session?.ws_url ?? null;
    const previousSessionKey = previousSessionKeyRef.current;
    if (previousSessionKey !== undefined && previousSessionKey !== nextSessionKey) {
      clearTerminalState();
    }
    previousSessionKeyRef.current = nextSessionKey;
  }, [clearTerminalState, session?.ws_url]);

  useEffect(() => {
    if (!client) {
      setWsState("idle");
      setDisconnectedReason(null);
      return undefined;
    }

    const unsubscribe = client.subscribeState((nextState) => {
      setWsState(nextState);
      if (nextState === "closed" || nextState === "error") {
        setDisconnectedReason("Connection to Atmos Computer is unavailable.");
      } else if (nextState === "reconnecting") {
        setDisconnectedReason("Reconnecting to Atmos Computer.");
      } else if (nextState === "open") {
        setDisconnectedReason(null);
      }
    });

    client.connect();
    const unsubscribeTitles = client.subscribeMessages((message) => {
      const update = terminalTitleUpdate(message);
      if (!update) return;
      useTerminalStore.setState((state) => ({
        entriesByWorkspaceId: {
          ...state.entriesByWorkspaceId,
          [update.workspace_id]: applyServerTerminalTitle(
            state.entriesByWorkspaceId[update.workspace_id] ?? [],
            update,
          ),
        },
      }));
      queryClient.setQueriesData<{ byWorkspaceId: Record<string, TerminalWorkspaceCandidate[]> }>(
        { queryKey: ["session-terminal-candidates"] },
        (current) => patchCandidateTitles(current, update),
      );
    });
    return () => {
      unsubscribeTitles();
      unsubscribe();
      client.close();
    };
  }, [client, queryClient, setDisconnectedReason]);

  return <MobileWsContext.Provider value={{ client, state: wsState }}>{children}</MobileWsContext.Provider>;
}

export function useMobileWs() {
  return useContext(MobileWsContext);
}

function terminalTitleUpdate(message: unknown): TerminalTitleUpdatedNotification | null {
  if (!message || typeof message !== "object") return null;
  const envelope = message as { type?: unknown; payload?: { event?: unknown; data?: unknown } };
  if (envelope.type !== "notification" || envelope.payload?.event !== "terminal_title_updated") {
    return null;
  }
  const data = envelope.payload.data;
  if (!data || typeof data !== "object") return null;
  const update = data as TerminalTitleUpdatedNotification;
  if (!update.workspace_id || !update.tmux_window_name) return null;
  return update;
}

function patchCandidateTitles(
  current: { byWorkspaceId: Record<string, TerminalWorkspaceCandidate[]> } | undefined,
  update: TerminalTitleUpdatedNotification,
): { byWorkspaceId: Record<string, TerminalWorkspaceCandidate[]> } | undefined {
  if (!current) return current;
  const list = current.byWorkspaceId[update.workspace_id];
  if (!list) return current;
  return {
    ...current,
    byWorkspaceId: {
      ...current.byWorkspaceId,
      [update.workspace_id]: list.map((candidate) =>
        candidate.tmux_window_name === update.tmux_window_name
          ? {
              ...candidate,
              dynamic_title: update.dynamic_title,
              osc_title: update.osc_title,
              session_title: update.session_title,
            }
          : candidate,
      ),
    },
  };
}
