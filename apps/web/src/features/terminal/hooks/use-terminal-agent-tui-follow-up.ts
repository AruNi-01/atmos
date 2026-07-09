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
  const cleanupByPaneRef = useRef<
    Map<string, (options?: { abortUnsubmitted?: boolean }) => void>
  >(new Map());

  const clearFollowUp = useCallback((
    paneId: string,
    options?: { abortUnsubmitted?: boolean },
  ) => {
    const cleanup = cleanupByPaneRef.current.get(paneId);
    if (!cleanup) return;
    cleanup(options);
    cleanupByPaneRef.current.delete(paneId);
  }, []);

  useEffect(() => {
    return () => {
      for (const paneId of [...cleanupByPaneRef.current.keys()]) {
        // Passive teardown: cancel timers only. Do not Ctrl-C in-flight pastes.
        clearFollowUp(paneId);
      }
    };
  }, [clearFollowUp]);

  const deliverPendingRun = useCallback(
    (paneId: string, run: PendingTerminalRun) => {
      // A newer run is replacing this pane's pending launch — abort orphaned paste.
      clearFollowUp(paneId, { abortUnsubmitted: true });
      const terminalRef = terminalRefsMap.current.get(paneId);
      if (!terminalRef) return;
      const cleanup = deliverPendingTerminalRun(terminalRef, run);
      cleanupByPaneRef.current.set(paneId, cleanup);
    },
    [clearFollowUp, terminalRefsMap],
  );

  return {
    clearFollowUp,
    deliverPendingRun,
  };
}
