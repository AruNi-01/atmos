import { useCallback, useEffect, useRef } from "react";

import type { TerminalRef } from "@/features/terminal/components/Terminal";
import {
  deliverPendingTerminalRun,
  type PendingTerminalRun,
} from "@/features/terminal/lib/terminal-agent-run-delivery";

export type { PendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";
export { toPendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";

export function useTerminalAgentTuiFollowUp(
  terminalRefsMap: React.MutableRefObject<Map<string, TerminalRef>>,
) {
  const cleanupByPaneRef = useRef<Map<string, () => void>>(new Map());

  const clearFollowUp = useCallback((paneId: string) => {
    const cleanup = cleanupByPaneRef.current.get(paneId);
    if (!cleanup) return;
    cleanup();
    cleanupByPaneRef.current.delete(paneId);
  }, []);

  useEffect(() => {
    return () => {
      for (const paneId of [...cleanupByPaneRef.current.keys()]) {
        clearFollowUp(paneId);
      }
    };
  }, [clearFollowUp]);

  const deliverPendingRun = useCallback(
    (paneId: string, run: PendingTerminalRun) => {
      clearFollowUp(paneId);
      const terminalRef = terminalRefsMap.current.get(paneId);
      if (!terminalRef) return;
      const cleanup = deliverPendingTerminalRun(terminalRef, run);
      if (run.tuiFollowUp) {
        cleanupByPaneRef.current.set(paneId, cleanup);
      }
    },
    [clearFollowUp, terminalRefsMap],
  );

  return {
    clearFollowUp,
    deliverPendingRun,
  };
}
