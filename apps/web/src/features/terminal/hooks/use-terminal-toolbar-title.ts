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
import {
  isPathLikeTitle,
  isTmuxIndexTitle,
  nextOscTitleAfterIncoming,
  shortenPath,
} from "@atmos/shared/terminal";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import { useContestedCliOwners } from "./use-contested-cli-owners";

/** Where OSC title updates should be persisted (center terminal pane vs canvas pin). */
export type TerminalToolbarStoreWrite =
  | { kind: "terminal-pane"; workspaceId: string; paneId: string; terminalTabId?: string }
  | { kind: "tmux-window"; workspaceId: string; tmuxWindowName: string; contextScope: "workspace" | "project" }
  | { kind: "none" };

/**
 * Shared terminal tab title: subscribe to the same zustand fields as the center terminal pane,
 * merge shim dynamic titles + native OSC 0/2 titles, run {@link getTerminalDisplayMeta},
 * and emit onTitleChange / onOscTitleChange that persist display state like {@link TerminalGrid}.
 */
export function useTerminalToolbarTitle(options: {
  baseTitle: string;
  configuredAgents: TerminalPaneAgent[];
  pinnedAgent?: TerminalPaneAgent;
  storeWrite: TerminalToolbarStoreWrite;
  customLabel?: string;
  keepAgentName?: boolean;
  keepCwd?: boolean;
}) {
  // Shim OSC 9999 / dynamic titles (agent detection input) — not native OSC 0/2.
  const [localShimDynamicTitle, setLocalShimDynamicTitle] = useState<string | undefined>();
  // Native OSC 0/2 window titles (display suffix only; never drives agent detection).
  const [localNativeOscTitle, setLocalNativeOscTitle] = useState<string | undefined>();
  const { storeWrite, configuredAgents, baseTitle, pinnedAgent, customLabel, keepAgentName, keepCwd } = options;
  const contestedOwners = useContestedCliOwners();

  const storeLive = useTerminalStore(
    useShallow((s) => {
      if (storeWrite.kind === "terminal-pane") {
        return getWorkspacePaneFieldsByPaneId(
          s,
          storeWrite.workspaceId,
          storeWrite.paneId,
          storeWrite.terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        );
      }
      if (storeWrite.kind === "tmux-window") {
        if (storeWrite.contextScope !== "workspace" && storeWrite.contextScope !== "project") {
          return {
            dynamicTitle: undefined as string | undefined,
            oscTitle: undefined as string | undefined,
            agent: undefined as TerminalPaneAgent | undefined,
          };
        }
        return getWorkspacePaneLiveFieldsByTmuxWindow(s, storeWrite.workspaceId, storeWrite.tmuxWindowName);
      }
      return {};
    }),
  );

  const onTitleChange = useCallback(
    (title: string) => {
      // Keep the last cwd/command when tmux reports a window index.
      if (isTmuxIndexTitle(title)) return;
      setLocalShimDynamicTitle(title);
      if (storeWrite.kind === "none") return;
      const { setDynamicTitle, setPaneAgent } = useTerminalStore.getState();
      // Agent detection uses shim dynamic titles only — never native OSC (APP-047).
      const detected = resolveAgentForTitle(title, configuredAgents, { contestedOwners });
      if (storeWrite.kind === "terminal-pane") {
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
          storeWrite.contextScope === "project",
        );
        if (!hit) return;
        setDynamicTitle(storeWrite.workspaceId, hit.paneId, title, hit.terminalTabId);
        if (detected) {
          setPaneAgent(storeWrite.workspaceId, hit.paneId, detected, hit.terminalTabId);
        }
      }
    },
    [storeWrite, configuredAgents, contestedOwners],
  );

  const onOscTitleChange = useCallback(
    (title: string | undefined) => {
      // Keep local + store in lockstep. Path/`ls` noise preserves agent topics;
      // stale shell preexec command lines are cleared (nextOscTitleAfterIncoming).
      // Skip identical titles — agent CLIs re-emit OSC frequently; thrashing
      // local state restarts the marquee even when the topic did not change.
      setLocalNativeOscTitle((prev) => {
        const next = nextOscTitleAfterIncoming(prev, title);
        return prev === next ? prev : next;
      });
      if (storeWrite.kind === "none") return;
      const { setOscTitle } = useTerminalStore.getState();
      // Pass the raw value; setOscTitle re-applies nextOscTitleFromIncoming against
      // the store's previous value (same rules as local state above).
      if (storeWrite.kind === "terminal-pane") {
        setOscTitle(
          storeWrite.workspaceId,
          storeWrite.paneId,
          title,
          storeWrite.terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        );
        return;
      }
      if (storeWrite.kind === "tmux-window") {
        if (storeWrite.contextScope !== "workspace" && storeWrite.contextScope !== "project") return;
        const hit = findWorkspacePaneIdsByTmuxWindowName(
          useTerminalStore.getState(),
          storeWrite.workspaceId,
          storeWrite.tmuxWindowName,
          storeWrite.contextScope === "project",
        );
        if (!hit) return;
        setOscTitle(storeWrite.workspaceId, hit.paneId, title, hit.terminalTabId);
      }
    },
    [storeWrite],
  );

  const { displayTitle, primaryTitle, oscSuffix, toolbarAgent } = useMemo(() => {
    const mergedDynamic = storeLive.dynamicTitle ?? localShimDynamicTitle;
    const mergedNativeOsc = storeLive.oscTitle ?? localNativeOscTitle;
    const shapeAgent =
      pinnedAgent ??
      configuredAgents.find(
        (agent) => agent.label.trim().toLowerCase() === baseTitle.trim().toLowerCase(),
      );
    const mergedAgent = storeLive.agent ?? shapeAgent;
    const hasCustom = !!customLabel?.trim();
    const auto = getTerminalDisplayMeta({
      baseTitle,
      dynamicTitle: mergedDynamic,
      configuredAgents,
      agent: mergedAgent,
      contestedOwners,
      oscTitle: mergedNativeOsc,
      suppressOscTitle: hasCustom,
    });

    if (!hasCustom) {
      return auto;
    }

    const custom = customLabel!.trim();
    // Flags default to on: `undefined` is treated as `true`.
    const wantAgent = keepAgentName !== false;
    const wantCwd = keepCwd !== false;

    // Custom labels suppress native OSC suffixes entirely (APP-047 / APP-033).
    // Agent icon still renders when toolbarAgent is set; only the name suffix is optional.
    const showAgentLabel = wantAgent && !!auto.toolbarAgent;
    const cwdSuffix =
      !showAgentLabel && wantCwd && mergedDynamic
        ? isPathLikeTitle(mergedDynamic)
          ? shortenPath(mergedDynamic)
          : auto.toolbarAgent
            ? undefined
            : mergedDynamic
        : undefined;

    const displayTitle = [
      custom,
      showAgentLabel ? auto.toolbarAgent!.label : undefined,
      cwdSuffix,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      displayTitle,
      primaryTitle: displayTitle,
      oscSuffix: "",
      toolbarAgent: auto.toolbarAgent,
    };
  }, [
    baseTitle,
    configuredAgents,
    pinnedAgent,
    storeLive.agent,
    storeLive.dynamicTitle,
    storeLive.oscTitle,
    localShimDynamicTitle,
    localNativeOscTitle,
    customLabel,
    keepAgentName,
    keepCwd,
    contestedOwners,
  ]);

  return { displayTitle, primaryTitle, oscSuffix, toolbarAgent, onTitleChange, onOscTitleChange };
}
