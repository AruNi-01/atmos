"use client";

import { useEffect } from "react";
import {
  AGENT_STATE,
  useAgentStatusStore,
} from "@/features/agent/store/agent-status-store";
import { findSessionForPaneId } from "@/features/agent/store/agent-status-idle";
import {
  findTerminalPaneByStableAgentPaneId,
  paneTitleIndicatesAgentExited,
} from "@/features/agent/lib/agent-status-pane-title";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

/** Wait for cwd/command titles to settle before dropping a leftover running row. */
export const AGENT_HOOK_TITLE_EXIT_SETTLE_MS = 1000;

function paneIdForSession(session: { session_id: string; pane_id?: string | null }): string {
  return session.pane_id?.trim() || session.session_id;
}

/**
 * When a terminal's live toolbar title drops the agent brand (process exited,
 * shell back at cwd), remove leftover hook sessions so footer Agent status
 * cannot keep showing Running after the pane has already moved on.
 */
export function useDismissExitedAgentStatusSessions() {
  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const clearPending = (sessionId: string) => {
      const timer = pending.get(sessionId);
      if (timer) clearTimeout(timer);
      pending.delete(sessionId);
    };

    const scan = () => {
      const sessions = useAgentStatusStore.getState().sessions;
      const terminal = useTerminalStore.getState();
      const seen = new Set<string>();

      for (const session of sessions.values()) {
        seen.add(session.session_id);
        if (session.state === AGENT_STATE.IDLE) {
          clearPending(session.session_id);
          continue;
        }

        const paneId = paneIdForSession(session);
        const pane = findTerminalPaneByStableAgentPaneId(terminal, paneId);
        if (!pane || !paneTitleIndicatesAgentExited(pane)) {
          clearPending(session.session_id);
          continue;
        }
        if (pending.has(session.session_id)) continue;

        pending.set(
          session.session_id,
          setTimeout(() => {
            pending.delete(session.session_id);
            const hooks = useAgentStatusStore.getState();
            const current =
              hooks.sessions.get(session.session_id) ??
              findSessionForPaneId(hooks.sessions, paneId);
            if (!current || current.state === AGENT_STATE.IDLE) return;
            const livePane = findTerminalPaneByStableAgentPaneId(
              useTerminalStore.getState(),
              paneIdForSession(current),
            );
            if (!livePane || !paneTitleIndicatesAgentExited(livePane)) return;
            void hooks.removeSession(current.session_id);
          }, AGENT_HOOK_TITLE_EXIT_SETTLE_MS),
        );
      }

      for (const sessionId of [...pending.keys()]) {
        if (!seen.has(sessionId)) clearPending(sessionId);
      }
    };

    const unsubHooks = useAgentStatusStore.subscribe(scan);
    const unsubTerm = useTerminalStore.subscribe(scan);
    scan();
    return () => {
      unsubHooks();
      unsubTerm();
      for (const sessionId of [...pending.keys()]) clearPending(sessionId);
    };
  }, []);
}
