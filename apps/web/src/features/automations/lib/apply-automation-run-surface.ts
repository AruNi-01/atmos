import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { automationRunSurfacePlan } from "@/features/automations/lib/automation-run-surface-plan";
import { automationTerminalWindowName } from "@/features/automations/lib/automation-run-landing";
import type { AutomationRunSummary } from "@/features/automations/types";
import { invalidateProjectBootstrap } from "@/features/project/hooks/use-project-bootstrap-query";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

/**
 * Attach the run's workspace / Term / Chat data without switching the current
 * page. The user stays where they are; the new row or tab shows up in place.
 */
export function applyAutomationRunSurface(run: AutomationRunSummary): void {
  const plan = automationRunSurfacePlan(run);
  if (plan.refreshWorkspaceSidebar) {
    void invalidateProjectBootstrap();
  }
  if (!plan.contextId || !plan.kind || !plan.tabValue) return;

  if (plan.kind === "chat") {
    const chatId = run.surface_session_id?.trim();
    if (!chatId) return;
    useAgentChatCenterTabsStore.getState().openTab({
      contextId: plan.contextId,
      chatId,
      title: run.terminal_display_name,
    });
  } else {
    const ensured = useTerminalStore.getState().ensureAutomationTerminalTab(plan.contextId, {
      windowName: automationTerminalWindowName(run.guid),
      title: run.terminal_display_name,
    });
    if (ensured) {
      useCenterPaneLayoutStore.getState().offerTab(plan.contextId, ensured.id);
      return;
    }
  }

  useCenterPaneLayoutStore.getState().offerTab(plan.contextId, plan.tabValue);
}
