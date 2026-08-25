"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useHotkeys } from "react-hotkeys-hook";
import { AgentManagerView } from "@/features/agent/components/AgentManagerView";
import { AutomationPage } from "@/features/automations/components/AutomationPage";
import { DiskAnalyzerPage } from "@/features/disk-analyzer/components/DiskAnalyzerPage";
import { SkillsView } from "@/features/skills/components/SkillsView";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import { TerminalsView } from "@/features/terminal/components/TerminalsView";
import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { WorkspacesManagementView } from "@/features/workspace/components/WorkspacesManagementView";
import { TaskManagementView } from "@/features/task/components/TaskManagementView";
import { TokenUsagePage } from "@/app-shell/TokenUsagePage";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import type { TerminalCenterTab } from "@/features/terminal/store/use-terminal-store";
import { isTerminalCenterTabValue } from "@/app-shell/center-stage-tabs";
import {
  CENTER_STRIP_POSITION_HOTKEYS,
  centerStripShortcutDigitFromEvent,
  resolveCenterStripShortcutTabId,
} from "@/app-shell/center-stage-tab-model";
import {
  CENTER_REGION_DIGIT_HOTKEY_OPTIONS,
  consumeCenterRegionDigitEvent,
  dispatchCenterRegionDigitShortcut,
  isCenterStageHotkeyTarget,
  registerCenterStripShortcutHandler,
} from "@/app-shell/shortcut-prefix";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import {
  schedulePromoteWorkspaceSurfaceSwitch,
  shouldPromoteWorkspaceSurface,
} from "@/app-shell/workspace-surface-switch";
import {
  readCenterStageLastTab,
  setCenterStageLastTab,
} from "@/shared/stores/use-ui-pref-hooks";
import { CenterStageSurface } from "@/app-shell/center-stage-chrome";

export { resolveCenterStageProjectContext } from "@/app-shell/center-stage-project-context";

const PtDesignStandaloneStage = dynamic(
  () =>
    import("@/features/pt-design/PtDesignStandaloneStage").then(
      (mod) => mod.PtDesignStandaloneStage,
    ),
  { ssr: false },
);

type TerminalGridRef = React.RefObject<TerminalGridHandle | null>;
type TerminalGridRefs = React.RefObject<Record<string, TerminalGridHandle | null>>;

export function CenterStageNoContextView({
  currentView,
  automationsEnabled,
  onAddProject,
  onConnectAgent,
  ptDesignOpen = false,
}: {
  currentView: string;
  automationsEnabled: boolean;
  onAddProject: () => void;
  onConnectAgent: () => void;
  ptDesignOpen?: boolean;
}) {
  const body = (() => {
    if (currentView === "pt-design" || ptDesignOpen) {
      return <PtDesignStandaloneStage />;
    }
    if (currentView === "workspaces") return <WorkspacesManagementView />;
    if (currentView === "skills") return <SkillsView />;
    if (currentView === "terminals") return <TerminalsView />;
    if (currentView === "agents") return <AgentManagerView />;
    if (currentView === "automations" && automationsEnabled) return <AutomationPage />;
    if (currentView === "disk-analyzer") return <DiskAnalyzerPage />;
    if (currentView === "token-usage") return <TokenUsagePage />;
    if (currentView === "tasks") return <TaskManagementView />;
    return (
      <HostedWelcomeGate onAddProject={onAddProject} onConnectAgent={onConnectAgent} />
    );
  })();

  return (
    <CenterStageSurface
      data-testid={currentView === "pt-design" || ptDesignOpen ? "pt-design-standalone" : undefined}
    >
      {body}
    </CenterStageSurface>
  );
}

export function useReloadOpenFilesWhenReady({
  effectiveContextId,
  isSetupBlocking,
  openFiles,
  reloadFileContent,
}: {
  effectiveContextId: string | null | undefined;
  isSetupBlocking: boolean;
  openFiles: OpenFile[];
  reloadFileContent: (path: string, workspaceId?: string) => Promise<void>;
}) {
  const reloadingFilesRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    for (const file of openFiles) {
      if (!file.isLoading) continue;
      const key = `${effectiveContextId}:${file.path}`;
      if (reloadingFilesRef.current.has(key)) continue;
      reloadingFilesRef.current.add(key);
      reloadFileContent(file.path, effectiveContextId)
        .finally(() => {
          reloadingFilesRef.current.delete(key);
        });
    }
  }, [effectiveContextId, isSetupBlocking, openFiles, reloadFileContent]);
}

export function useTerminalTabMountLifecycle({
  activeValue,
  effectiveContextId,
  setMountedTerminalTabsByContext,
  visibleTerminalTabs,
}: {
  activeValue: string;
  effectiveContextId: string | null | undefined;
  setMountedTerminalTabsByContext: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  visibleTerminalTabs: TerminalCenterTab[];
}) {
  const previousTerminalContextRef = React.useRef<string | null>(null);
  /** Last known activeValue per context — written before setActive on leave (APP-043). */
  const lastActiveTabByContextRef = React.useRef<Record<string, string>>({});
  // Do NOT subscribe CenterStage to `warm` — that re-renders the entire shell
  // (tab bar + multi-frame host) on every touch. Read warm via getState in effects.
  const warmEpoch = useWorkspaceSurfaceCacheStore((s) => s.warm.length);

  // Track tab while context is stable so leave path can persist before activate next.
  // Ref writes during render are safe; do not call Zustand or setState here.
  if (effectiveContextId && activeValue) {
    lastActiveTabByContextRef.current[effectiveContextId] = activeValue;
  }

  // After URL commits: promote leave→warm. Slow hops flush immediately; rapid
  // route commits coalesce to the latest id and touch intermediate leaves so
  // A→B→C still keeps B warm without N multi-frame switchContext commits.
  React.useEffect(() => {
    const current = effectiveContextId ?? null;
    const leavingContextId = previousTerminalContextRef.current;

    if (leavingContextId && leavingContextId !== current) {
      const prevTab =
        lastActiveTabByContextRef.current[leavingContextId] ??
        readCenterStageLastTab(leavingContextId);
      if (prevTab) {
        setCenterStageLastTab(leavingContextId, prevTab);
        if (isTerminalCenterTabValue(prevTab)) {
          setMountedTerminalTabsByContext((state) => {
            const mountedTabs = state[leavingContextId] ?? [];
            if (mountedTabs.includes(prevTab)) return state;
            return {
              ...state,
              [leavingContextId]: [...mountedTabs, prevTab],
            };
          });
        }
      }
    }

    // `/token-usage`, `/tasks`, and other launchpad routes have no host id.
    // Do not promote Active→null: that unmounts Terminal grids and can mint a
    // second empty tmux window on return, orphaning a still-running agent TUI.
    if (!shouldPromoteWorkspaceSurface(current)) {
      return;
    }

    previousTerminalContextRef.current = current;
    return schedulePromoteWorkspaceSurfaceSwitch(current, leavingContextId);
  }, [effectiveContextId, setMountedTerminalTabsByContext]);

  // Ensure Active ∪ Warm contexts keep their last terminal tab mounted for the
  // whole warm lifetime (tab-like keep-alive across workspace switch).
  React.useEffect(() => {
    const live = useWorkspaceSurfaceCacheStore.getState();
    const ensureIds = [
      ...live.warm.map((w) => w.contextId),
      live.activeContextId,
      effectiveContextId,
    ].filter(Boolean) as string[];
    setMountedTerminalTabsByContext((current) => {
      let changed = false;
      const next = { ...current };
      for (const id of ensureIds) {
        const last = lastActiveTabByContextRef.current[id] ?? readCenterStageLastTab(id);
        if (!last || !isTerminalCenterTabValue(last)) continue;
        const mounted = next[id] ?? [];
        if (mounted.includes(last)) continue;
        next[id] = [...mounted, last];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [effectiveContextId, warmEpoch, setMountedTerminalTabsByContext]);

  React.useEffect(() => {
    // Keep mounted-tab bookkeeping for Active ∪ Warm only (frozen contexts drop).
    const liveWarm = useWorkspaceSurfaceCacheStore.getState().warm;
    setMountedTerminalTabsByContext((current) => {
      const activeIds = new Set([
        effectiveContextId,
        previousTerminalContextRef.current,
        ...liveWarm.map((c) => c.contextId),
      ]);
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(current)) {
        if (activeIds.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [effectiveContextId, warmEpoch, setMountedTerminalTabsByContext]);

  React.useEffect(() => {
    // Only register one sweeper interval globally to prevent HMR leaks
    const globalState = globalThis as typeof globalThis & {
      __workspaceSurfaceCacheSweeperInterval?: ReturnType<typeof setInterval>;
    };
    if (!globalState.__workspaceSurfaceCacheSweeperInterval) {
      globalState.__workspaceSurfaceCacheSweeperInterval = setInterval(() => {
        useWorkspaceSurfaceCacheStore.getState().sweepExpired();
      }, 60 * 1000);
    }
  }, []);

  React.useEffect(() => {
    if (!effectiveContextId || !isTerminalCenterTabValue(activeValue)) return;

    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId] ?? [];
      if (mountedTabs.includes(activeValue)) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: [...mountedTabs, activeValue],
      };
    });
  }, [activeValue, effectiveContextId, setMountedTerminalTabsByContext]);

  React.useEffect(() => {
    if (!effectiveContextId) return;

    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId];
      if (!mountedTabs) return current;

      const nextMountedTabs = mountedTabs.filter((tabId) =>
        visibleTerminalTabs.some((tab) => tab.id === tabId),
      );

      if (nextMountedTabs.length === mountedTabs.length) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: nextMountedTabs,
      };
    });
  }, [effectiveContextId, setMountedTerminalTabsByContext, visibleTerminalTabs]);
}

export type PendingNamedTerminalRun = {
  command: string;
  tuiFollowUpPrompt?: string;
  agentId?: string;
};

export function usePendingNamedTerminalCommand({
  activeTabValue,
  activeValue,
  effectiveContextId,
  pendingCommand,
  setPendingCommand,
  tabVisible,
  terminalGridRef,
  terminalLabel,
  userTriggeredRef,
}: {
  activeTabValue: string;
  activeValue: string;
  effectiveContextId: string | null | undefined;
  pendingCommand: PendingNamedTerminalRun | null;
  setPendingCommand: React.Dispatch<React.SetStateAction<PendingNamedTerminalRun | null>>;
  tabVisible: boolean;
  terminalGridRef: TerminalGridRef;
  terminalLabel: string;
  userTriggeredRef: React.RefObject<boolean>;
}) {
  React.useEffect(() => {
    if (!pendingCommand || !effectiveContextId || !tabVisible || activeValue !== activeTabValue) return;

    const run = pendingCommand;
    setPendingCommand(null);
    terminalGridRef.current?.createOrFocusAndRunTerminal({
      label: terminalLabel,
      command: run.command,
      agentId: run.agentId,
      tuiFollowUpPrompt: run.tuiFollowUpPrompt,
    });

    const timer = setTimeout(() => {
      userTriggeredRef.current = false;
    }, 3000);
    return () => clearTimeout(timer);
  }, [
    activeTabValue,
    activeValue,
    effectiveContextId,
    pendingCommand,
    setPendingCommand,
    tabVisible,
    terminalGridRef,
    terminalLabel,
    userTriggeredRef,
  ]);
}

export function useCenterStageKeyboardShortcuts({
  effectiveContextId,
  handleCenterStageTabChange,
  orderedTabValues,
}: {
  effectiveContextId: string | null | undefined;
  handleCenterStageTabChange: (
    value: string,
    options?: { placement?: "focused" },
  ) => void;
  orderedTabValues: readonly string[];
}) {
  React.useEffect(() => {
    registerCenterStripShortcutHandler((digit) => {
      if (digit === 0) {
        if (!effectiveContextId) return false;
        handleCenterStageTabChange("overview", { placement: "focused" });
        return true;
      }
      const target = resolveCenterStripShortcutTabId(orderedTabValues, digit);
      if (!target) return false;
      handleCenterStageTabChange(target, { placement: "focused" });
      return true;
    });
    return () => registerCenterStripShortcutHandler(null);
  }, [effectiveContextId, handleCenterStageTabChange, orderedTabValues]);

  useHotkeys(
    "mod+0",
    (event) => {
      if (event.shiftKey) return;
      if (!isCenterStageHotkeyTarget(event.target)) return;
      if (!dispatchCenterRegionDigitShortcut({ digit: 0, shift: false })) return;
      consumeCenterRegionDigitEvent(event);
    },
    CENTER_REGION_DIGIT_HOTKEY_OPTIONS,
    [effectiveContextId, handleCenterStageTabChange],
  );

  useHotkeys(
    CENTER_STRIP_POSITION_HOTKEYS,
    (event) => {
      if (event.shiftKey) return;
      if (!isCenterStageHotkeyTarget(event.target)) return;
      const digit = centerStripShortcutDigitFromEvent(event);
      if (digit == null) return;
      if (!dispatchCenterRegionDigitShortcut({ digit, shift: false })) return;
      consumeCenterRegionDigitEvent(event);
    },
    CENTER_REGION_DIGIT_HOTKEY_OPTIONS,
    [handleCenterStageTabChange, orderedTabValues],
  );
}
