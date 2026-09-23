import { isTmuxIndexTitle } from "@atmos/shared/terminal";
import {
  findTerminalPaneByStableAgentPaneId,
  type AgentHookPaneLookupState,
} from "@/features/agent/lib/agent-status-pane-title";
import { resolvePaneTitleForCenterTab } from "@/features/terminal/lib/terminal-center-tab-presentation";

/** Title shown on the center terminal tab. Tmux window indexes are not titles. */
export function sessionTerminalTabTitle(
  sessionId: string,
  panes: AgentHookPaneLookupState,
): string | null {
  const pane = findTerminalPaneByStableAgentPaneId(panes, sessionId);
  if (!pane) return null;
  const tabTitle = resolvePaneTitleForCenterTab(pane).displayTitle.trim();
  if (tabTitle && !isTmuxIndexTitle(tabTitle)) return tabTitle;
  const dynamic = pane.dynamicTitle?.trim();
  if (dynamic && !isTmuxIndexTitle(dynamic)) return dynamic;
  return null;
}

export function sessionTerminalTitleMap(
  sessionIds: readonly string[],
  panes: AgentHookPaneLookupState,
): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const sessionId of sessionIds) {
    const title = sessionTerminalTabTitle(sessionId, panes);
    if (title) titles[sessionId] = title;
  }
  return titles;
}
