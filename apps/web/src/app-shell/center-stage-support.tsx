"use client";

import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { AgentManagerView } from "@/features/agent/components/AgentManagerView";
import { AutomationPage } from "@/features/automations/components/AutomationPage";
import { DiskAnalyzerPage } from "@/features/disk-analyzer/components/DiskAnalyzerPage";
import { SkillsView } from "@/features/skills/components/SkillsView";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import { TerminalsView } from "@/features/terminal/components/TerminalsView";
import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { WorkspacesManagementView } from "@/features/workspace/components/WorkspacesManagementView";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import type { TerminalCenterTab } from "@/features/terminal/store/use-terminal-store";
import { FIXED_TABS, isTerminalCenterTabValue } from "@/app-shell/center-stage-tabs";
import type { Project, Workspace } from "@/shared/types/domain";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import {
  readCenterStageLastTab,
  setCenterStageLastTab,
} from "@/shared/stores/use-ui-pref-hooks";

type TerminalGridRef = React.RefObject<TerminalGridHandle | null>;
type TerminalGridRefs = React.RefObject<Record<string, TerminalGridHandle | null>>;

export function resolveCenterStageProjectContext(
  projects: Project[],
  effectiveContextId: string | null,
): { currentProject: Project | undefined; currentWorkspace: Workspace | undefined } {
  if (!effectiveContextId) {
    return { currentProject: undefined, currentWorkspace: undefined };
  }

  for (const project of projects) {
    const workspace = project.workspaces.find(w => w.id === effectiveContextId);
    if (workspace) {
      return { currentProject: project, currentWorkspace: workspace };
    }
  }

  const project = projects.find(p => p.id === effectiveContextId);
  return { currentProject: project, currentWorkspace: undefined };
}

export function CenterStageNoContextView({
  currentView,
  automationsEnabled,
  onAddProject,
  onConnectAgent,
}: {
  currentView: string;
  automationsEnabled: boolean;
  onAddProject: () => void;
  onConnectAgent: () => void;
}) {
  if (currentView === "workspaces") {
    return (
      <main className="h-full overflow-hidden">
        <WorkspacesManagementView />
      </main>
    );
  }

  if (currentView === "skills") {
    return (
      <main className="h-full overflow-hidden">
        <SkillsView />
      </main>
    );
  }

  if (currentView === "terminals") {
    return (
      <main className="h-full overflow-hidden">
        <TerminalsView />
      </main>
    );
  }

  if (currentView === "agents") {
    return (
      <main className="h-full overflow-hidden">
        <AgentManagerView />
      </main>
    );
  }

  if (currentView === "automations" && automationsEnabled) {
    return (
      <main className="h-full overflow-hidden">
        <AutomationPage />
      </main>
    );
  }

  if (currentView === "disk-analyzer") {
    return (
      <main className="h-full overflow-hidden">
        <DiskAnalyzerPage />
      </main>
    );
  }

  return (
    <main className="h-full overflow-hidden">
      <HostedWelcomeGate onAddProject={onAddProject} onConnectAgent={onConnectAgent} />
    </main>
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

  // After URL commits: persist leaving last-tab + atomic WSC switchContext.
  // Sticky leave in CenterStagePanels covers the one-frame gap before warm lands.
  React.useLayoutEffect(() => {
    const current = effectiveContextId ?? null;
    const previousContextId = previousTerminalContextRef.current;

    if (previousContextId && previousContextId !== current) {
      const prevTab =
        lastActiveTabByContextRef.current[previousContextId] ??
        readCenterStageLastTab(previousContextId);
      if (prevTab) {
        setCenterStageLastTab(previousContextId, prevTab);
        if (isTerminalCenterTabValue(prevTab)) {
          setMountedTerminalTabsByContext((state) => {
            const mountedTabs = state[previousContextId] ?? [];
            if (mountedTabs.includes(prevTab)) return state;
            return {
              ...state,
              [previousContextId]: [...mountedTabs, prevTab],
            };
          });
        }
      }
    }

    // Atomic active+warm update (single notification). Never runs in the click path.
    useWorkspaceSurfaceCacheStore.getState().switchContext(current);

    previousTerminalContextRef.current = current;
  }, [effectiveContextId, setMountedTerminalTabsByContext]);

  // Ensure Active ∪ Warm contexts keep their last terminal tab mounted for the
  // whole warm lifetime (tab-like keep-alive across workspace switch).
  React.useLayoutEffect(() => {
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

export function useCenterStageTabScrollEffects({
  activeValue,
  codeReviewTabVisible,
  effectiveContextId,
  openFilesCount,
  projectWikiTabVisible,
  scrollableTabsRef,
  visibleTerminalTabsCount,
}: {
  activeValue: string;
  codeReviewTabVisible: boolean;
  effectiveContextId: string | null | undefined;
  openFilesCount: number;
  projectWikiTabVisible: boolean;
  scrollableTabsRef: React.RefObject<HTMLDivElement | null>;
  visibleTerminalTabsCount: number;
}) {
  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) return;

      const primaryDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (primaryDelta === 0) return;

      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + primaryDelta));
      if (nextScrollLeft === container.scrollLeft) return;

      event.preventDefault();
      container.scrollLeft = nextScrollLeft;
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [effectiveContextId, openFilesCount, projectWikiTabVisible, codeReviewTabVisible, visibleTerminalTabsCount, scrollableTabsRef]);

  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!activeValue || !container) return;
    if (FIXED_TABS.has(activeValue)) return;

    const timer = setTimeout(() => {
      const current = scrollableTabsRef.current;
      if (!current) return;
      const activeTab = current.querySelector<HTMLElement>('[data-active], [aria-selected="true"]');
      if (activeTab) {
        const containerRect = current.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        const isVisible = tabRect.left >= containerRect.left && tabRect.right <= containerRect.right;
        if (!isVisible) {
          activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [activeValue, effectiveContextId, openFilesCount, projectWikiTabVisible, codeReviewTabVisible, visibleTerminalTabsCount, scrollableTabsRef]);
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
  visibleTerminalTabs,
}: {
  effectiveContextId: string | null | undefined;
  handleCenterStageTabChange: (value: string) => void;
  visibleTerminalTabs: TerminalCenterTab[];
}) {
  useHotkeys(
    "mod+0",
    () => {
      if (!effectiveContextId) return;
      handleCenterStageTabChange("overview");
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [effectiveContextId, handleCenterStageTabChange],
  );

  useHotkeys(
    "mod+1",
    () => {
      const target = visibleTerminalTabs[0];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange, visibleTerminalTabs],
  );

  useHotkeys(
    "mod+2",
    () => {
      const target = visibleTerminalTabs[1];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange, visibleTerminalTabs],
  );

  useHotkeys(
    "mod+3",
    () => {
      const target = visibleTerminalTabs[2];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange, visibleTerminalTabs],
  );

  useHotkeys(
    "mod+4",
    () => {
      const target = visibleTerminalTabs[3];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange, visibleTerminalTabs],
  );

  useHotkeys(
    "mod+5",
    () => {
      const target = visibleTerminalTabs[4];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange, visibleTerminalTabs],
  );
}
