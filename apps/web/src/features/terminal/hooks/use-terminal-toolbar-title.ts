"use client";

import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  findWorkspacePaneIdsByTmuxWindowName,
  getWorkspacePaneFieldsByPaneId,
  getWorkspacePaneLiveFieldsByTmuxWindow,
  useTerminalStore,
  FIXED_TERMINAL_TAB_VALUE,
} from "@/features/terminal/store/use-terminal-store";
import { getTerminalDisplayMeta, resolveAgentForTitle } from "@/features/terminal/components/terminal-title";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";

/** Where OSC title updates should be persisted (center mosaic pane vs canvas pin). */
export type TerminalToolbarStoreWrite =
  | { kind: "mosaic-pane"; workspaceId: string; paneId: string; terminalTabId?: string }
  | { kind: "tmux-window"; workspaceId: string; tmuxWindowName: string; contextScope: "workspace" | "project" }
  | { kind: "none" };

/**
 * Shared terminal tab title: subscribe to the same zustand fields as the center mosaic,
 * merge OSC/local titles, run {@link getTerminalDisplayMeta}, and emit a single onTitleChange
 * that persists dynamic title + detected agent like {@link TerminalGrid}.
 */
export function useTerminalToolbarTitle(options: {
  baseTitle: string;
  configuredAgents: TerminalPaneAgent[];
  pinnedAgent?: TerminalPaneAgent;
  storeWrite: TerminalToolbarStoreWrite;
}) {
  const [localOscTitle, setLocalOscTitle] = useState<string | undefined>();
  const { storeWrite, configuredAgents, baseTitle, pinnedAgent } = options;

  const storeLive = useTerminalStore(
    useShallow((s) => {
      if (storeWrite.kind === "mosaic-pane") {
        return getWorkspacePaneFieldsByPaneId(
          s,
          storeWrite.workspaceId,
          storeWrite.paneId,
          storeWrite.terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        );
      }
      if (storeWrite.kind === "tmux-window") {
        if (storeWrite.contextScope !== "workspace" && storeWrite.contextScope !== "project") {
          return { dynamicTitle: undefined as string | undefined, agent: undefined as TerminalPaneAgent | undefined };
        }
        return getWorkspacePaneLiveFieldsByTmuxWindow(s, storeWrite.workspaceId, storeWrite.tmuxWindowName);
      }
      return {};
    }),
  );

  const onTitleChange = useCallback(
    (title: string) => {
      setLocalOscTitle(title);
      if (storeWrite.kind === "none") return;
      const { setDynamicTitle, setPaneAgent } = useTerminalStore.getState();
      const detected = resolveAgentForTitle(title, configuredAgents);
      if (storeWrite.kind === "mosaic-pane") {
        setDynamicTitle(
          storeWrite.workspaceId,
          storeWrite.paneId,
          title,
          storeWrite.terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        );
        if (detected) {
          setPaneAgent(
            storeWrite.workspaceId,
            storeWrite.paneId,
            detected,
            storeWrite.terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
          );
        }
        return;
      }
      if (storeWrite.kind === "tmux-window") {
        if (storeWrite.contextScope !== "workspace" && storeWrite.contextScope !== "project") return;
        const hit = findWorkspacePaneIdsByTmuxWindowName(
          useTerminalStore.getState(),
          storeWrite.workspaceId,
          storeWrite.tmuxWindowName,
        );
        if (!hit) return;
        setDynamicTitle(storeWrite.workspaceId, hit.paneId, title, hit.terminalTabId);
        if (detected) {
          setPaneAgent(storeWrite.workspaceId, hit.paneId, detected, hit.terminalTabId);
        }
      }
    },
    [storeWrite, configuredAgents],
  );

  const { displayTitle, toolbarAgent } = useMemo(() => {
    const mergedDynamic = storeLive.dynamicTitle ?? localOscTitle;
    const shapeAgent =
      pinnedAgent ??
      configuredAgents.find(
        (agent) => agent.label.trim().toLowerCase() === baseTitle.trim().toLowerCase(),
      );
    const mergedAgent = storeLive.agent ?? shapeAgent;
    return getTerminalDisplayMeta({
      baseTitle,
      dynamicTitle: mergedDynamic,
      configuredAgents,
      agent: mergedAgent,
    });
  }, [baseTitle, configuredAgents, pinnedAgent, storeLive.agent, storeLive.dynamicTitle, localOscTitle]);

  return { displayTitle, toolbarAgent, onTitleChange };
}
