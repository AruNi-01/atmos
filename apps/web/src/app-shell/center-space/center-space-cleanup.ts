import { CENTER_TOOL_TAB_VALUES } from "@/app-shell/center-tool-tabs";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { useToolCenterTabsStore } from "@/app-shell/center-tool-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import { useSimulatorCenterTabStore } from "@/features/simulator";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { simulatorApi } from "@/api/ws/simulator-api";
import {
  DEFAULT_CENTER_SPACE_ID,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";

/**
 * Drop every center resource owned by a paint context (an extra space).
 * Default-space (host id) cleanup is intentionally not used — deleting the
 * last space is forbidden.
 */
export function cleanupCenterSpaceContext(paintContextId: string): void {
  if (!paintContextId) return;
  const parsed = parseCenterSpaceKey(paintContextId);
  // Never wipe the host workspace itself.
  if (parsed.spaceId === DEFAULT_CENTER_SPACE_ID && paintContextId === parsed.hostId) {
    return;
  }

  useCenterPaneLayoutStore.getState().forgetContext(paintContextId);

  const editor = useEditorStore.getState();
  for (const file of editor.getOpenFiles(paintContextId)) {
    editor.closeFile(file.path, paintContextId);
  }

  const github = useGithubCenterTabsStore.getState();
  for (const tab of github.tabsByContext[paintContextId] ?? []) {
    github.closeTab(paintContextId, tab.value);
  }

  const browsers = useBrowserCenterTabsStore.getState();
  for (const tab of browsers.tabsByContext[paintContextId] ?? []) {
    browsers.closeBrowser(paintContextId, tab.value);
  }

  const terminal = useTerminalStore.getState();
  for (const tab of terminal.getTerminalTabs(paintContextId)) {
    terminal.closeTerminalTab(paintContextId, tab.id);
  }

  const tools = useToolCenterTabsStore.getState();
  for (const tool of CENTER_TOOL_TAB_VALUES) {
    tools.close(paintContextId, tool);
  }

  useSimulatorCenterTabStore.getState().close(paintContextId);
  void simulatorApi.stop(paintContextId).catch(() => {});
  useGitHistoryCenterTabStore.getState().close(paintContextId);
}
