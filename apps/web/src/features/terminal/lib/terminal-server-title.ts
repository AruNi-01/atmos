import type { TerminalTitleUpdatedNotification } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import { titlesFromServerSnapshot } from "@/features/terminal/store/terminal-store-helpers";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

function windowMatches(paneWindow: string, serverWindow: string): boolean {
  return paneWindow === serverWindow || paneWindow.endsWith(`__${serverWindow}`);
}

/** Apply one computer-owned title snapshot to every matching pane. */
export function applyServerTerminalTitle(update: TerminalTitleUpdatedNotification) {
  const workspaceId = update.workspace_id?.trim() ?? "";
  const windowName = update.tmux_window_name?.trim() ?? "";
  if (!workspaceId || !windowName) return;

  const { dynamicTitle, oscTitle } = titlesFromServerSnapshot(update);
  // Empty fields stay omitted. Writing them used to clear the cached topic
  // and the live pane, so Observer showed "Terminal" until this workspace
  // was opened and the PTY reported the OSC again.
  if (dynamicTitle) writeCachedDynamicTitle(workspaceId, windowName, dynamicTitle);
  if (oscTitle) writeCachedOscTitle(workspaceId, windowName, oscTitle);

  useTerminalStore.setState((state) => {
    let changed = false;
    const workspacePanes = { ...state.workspacePanes };
    for (const [scopeKey, panes] of Object.entries(workspacePanes)) {
      if (!panes) continue;
      let scopeChanged = false;
      const nextPanes = { ...panes };
      for (const [paneId, pane] of Object.entries(panes)) {
        if (pane.workspaceId !== workspaceId) continue;
        const paneWindow = pane.tmuxWindowName || pane.label || "";
        if (!windowMatches(paneWindow, windowName)) continue;
        const nextDynamic = dynamicTitle ?? pane.dynamicTitle;
        const nextOsc = oscTitle ?? pane.oscTitle;
        if (pane.dynamicTitle === nextDynamic && pane.oscTitle === nextOsc) continue;
        nextPanes[paneId] = { ...pane, dynamicTitle: nextDynamic, oscTitle: nextOsc };
        scopeChanged = true;
      }
      if (!scopeChanged) continue;
      workspacePanes[scopeKey] = nextPanes;
      changed = true;
    }
    return changed ? { workspacePanes } : state;
  });
}

let unsubscribe: (() => void) | null = null;

export function initServerTerminalTitles() {
  if (unsubscribe) return;
  unsubscribe = useWebSocketStore.getState().onEvent("terminal_title_updated", (payload) => {
    applyServerTerminalTitle(payload);
  });
}
