import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { useToolCenterTabsStore } from "@/app-shell/center-tool-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import { extraCenterSpaceTmuxWindowPrefix } from "@/features/terminal/store/terminal-store-helpers";
import { useSimulatorCenterTabStore } from "@/features/simulator";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { simulatorApi } from "@/api/ws/simulator-api";
import { systemApi } from "@/api/rest-api";
import {
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { clearCenterTabActivationStack } from "@/app-shell/center-stage-tab-activation-stack";
import {
  clearAgentLastSession,
  forgetPaintContextUiPrefs,
} from "@/shared/stores/use-ui-pref-hooks";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";

function omitContextKey<T>(
  record: Record<string, T>,
  contextId: string,
): Record<string, T> {
  if (!(contextId in record)) return record;
  const next = { ...record };
  delete next[contextId];
  return next;
}

function killExtraSpaceTmuxWindows(paintContextId: string): void {
  const prefix = extraCenterSpaceTmuxWindowPrefix(paintContextId);
  if (!prefix) return;
  const hostId = hostIdFromCenterKey(paintContextId);
  const names = new Set<string>();
  const terminal = useTerminalStore.getState();
  for (const tab of terminal.getTerminalTabs(paintContextId)) {
    for (const pane of Object.values(terminal.getPanes(paintContextId, tab.id))) {
      if (pane.tmuxWindowName?.startsWith(prefix)) {
        names.add(pane.tmuxWindowName);
      }
    }
  }
  void (async () => {
    try {
      const { windows } = await systemApi.listTmuxWindows(hostId);
      for (const window of windows) {
        if (window.name.startsWith(prefix)) names.add(window.name);
      }
    } catch {
      // Offline / no tmux: still try any names collected from the store.
    }
    await Promise.all(
      [...names].map((name) => systemApi.killTmuxWindow(hostId, name).catch(() => {})),
    );
  })();
}

/**
 * Drop every center resource owned by a paint context (an extra space).
 * Default-space (host id) cleanup is intentionally not used — deleting the
 * last space is forbidden.
 *
 * Order: capture/kill live processes → drop tab stores → drop chrome prefs.
 */
export function cleanupCenterSpaceContext(paintContextId: string): void {
  if (!paintContextId) return;
  const parsed = parseCenterSpaceKey(paintContextId);
  // Never wipe the host workspace itself.
  if (parsed.spaceId === DEFAULT_CENTER_SPACE_ID && paintContextId === parsed.hostId) {
    return;
  }

  killExtraSpaceTmuxWindows(paintContextId);
  void simulatorApi.stop(paintContextId).catch(() => {});

  useCenterPaneLayoutStore.getState().forgetContext(paintContextId);
  useWorkspaceSurfaceCacheStore.getState().freeze(paintContextId, "manual");

  const editor = useEditorStore.getState();
  for (const file of editor.getOpenFiles(paintContextId)) {
    editor.closeFile(file.path, paintContextId);
  }
  useEditorStore.setState((state) => {
    if (!(paintContextId in (state.workspaceStates ?? {}))) return state;
    const workspaceStates = { ...state.workspaceStates };
    delete workspaceStates[paintContextId];
    return { workspaceStates };
  });

  useGithubCenterTabsStore.setState((state) => ({
    tabsByContext: omitContextKey(state.tabsByContext, paintContextId),
  }));
  useBrowserCenterTabsStore.setState((state) => ({
    tabsByContext: omitContextKey(state.tabsByContext, paintContextId),
  }));

  useTerminalStore.getState().detachWorkspaceFrontend(paintContextId);

  useToolCenterTabsStore.setState((state) => ({
    visibleByContext: omitContextKey(state.visibleByContext, paintContextId),
  }));
  useSimulatorCenterTabStore.setState((state) => ({
    visibleByContext: omitContextKey(state.visibleByContext, paintContextId),
  }));
  useGitHistoryCenterTabStore.setState((state) => ({
    visibleByContext: omitContextKey(state.visibleByContext, paintContextId),
    selectedCommitByContext: omitContextKey(state.selectedCommitByContext, paintContextId),
  }));

  forgetPaintContextUiPrefs(paintContextId);
  clearAgentLastSession(paintContextId);
  clearCenterTabActivationStack(paintContextId);
}
