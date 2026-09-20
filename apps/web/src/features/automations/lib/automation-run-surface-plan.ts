import {
  automationChatTabValue,
  automationTerminalTabValue,
  parseExecuteMode,
} from "@/features/automations/lib/automation-run-landing";
import type { AutomationRunSummary } from "@/features/automations/types";

export type AutomationRunSurfacePlan = {
  contextId: string | null;
  tabValue: string | null;
  kind: "terminal" | "chat" | null;
  refreshWorkspaceSidebar: boolean;
};

export function automationRunSurfacePlan(
  run: Pick<
    AutomationRunSummary,
    | "guid"
    | "status"
    | "execute_mode"
    | "surface_kind"
    | "surface_scope_id"
    | "surface_session_id"
    | "created_workspace_guid"
    | "workspace_guid"
    | "project_guid"
  >,
): AutomationRunSurfacePlan {
  const refreshWorkspaceSidebar = Boolean(run.created_workspace_guid?.trim());
  const contextId =
    run.surface_scope_id?.trim() ||
    run.created_workspace_guid?.trim() ||
    run.workspace_guid?.trim() ||
    run.project_guid?.trim() ||
    null;
  if (run.status === "failed" || !contextId) {
    return {
      contextId,
      tabValue: null,
      kind: null,
      refreshWorkspaceSidebar,
    };
  }
  const kind = surfaceKind(run);
  if (kind === "chat") {
    const chatId = run.surface_session_id?.trim();
    return {
      contextId,
      tabValue: chatId ? automationChatTabValue(chatId) : null,
      kind: chatId ? "chat" : null,
      refreshWorkspaceSidebar,
    };
  }
  if (kind === "terminal") {
    return {
      contextId,
      tabValue: automationTerminalTabValue(run.guid),
      kind: "terminal",
      refreshWorkspaceSidebar,
    };
  }
  return {
    contextId,
    tabValue: null,
    kind: null,
    refreshWorkspaceSidebar,
  };
}

function surfaceKind(
  run: Pick<AutomationRunSummary, "execute_mode" | "surface_kind">,
): "terminal" | "chat" | null {
  const fromSurface = String(run.surface_kind ?? "").trim();
  if (fromSurface === "terminal" || fromSurface === "chat") return fromSurface;
  const mode = parseExecuteMode(run.execute_mode);
  return mode === "headless" ? null : mode;
}
