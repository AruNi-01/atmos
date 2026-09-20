import type {
  AutomationExecuteMode,
  AutomationRunDetail,
  AutomationSummary,
} from "@/features/automations/types";

export type AutomationRunFollowUpKind =
  | "continue-menu"
  | "open-terminal"
  | "open-chat";

type RunLandingFields = Pick<
  AutomationRunDetail,
  | "guid"
  | "execute_mode"
  | "surface_kind"
  | "surface_scope_id"
  | "surface_session_id"
  | "target_kind"
  | "project_guid"
  | "workspace_guid"
  | "created_workspace_guid"
  | "automation_guid"
>;

type RunEnvironmentTarget = {
  kind: "standalone" | "project" | "workspace";
  id: string;
};

export function parseExecuteMode(
  raw: string | null | undefined,
): AutomationExecuteMode {
  if (raw === "terminal" || raw === "chat") return raw;
  return "headless";
}

/** Prefer the run's live surface over the job's configured execute mode. */
export function runSurfaceMode(
  run: Pick<AutomationRunDetail, "execute_mode" | "surface_kind">,
): AutomationExecuteMode {
  const surface = String(run.surface_kind ?? "").trim();
  if (surface === "terminal" || surface === "chat") return surface;
  return parseExecuteMode(run.execute_mode);
}

export function runFollowUpKind(
  run: Pick<AutomationRunDetail, "execute_mode" | "surface_kind">,
): AutomationRunFollowUpKind {
  const mode = runSurfaceMode(run);
  if (mode === "terminal") return "open-terminal";
  if (mode === "chat") return "open-chat";
  return "continue-menu";
}

export function shortRunId(runGuid: string): string {
  return runGuid.slice(0, 8);
}

export function automationTabTooltip(jobName: string, runGuid: string): string {
  return `${jobName} · ${shortRunId(runGuid)}`;
}

export function standaloneScopeId(automationGuid: string): string {
  return `automation:${automationGuid}`;
}

export function parseStandaloneScope(scope: string): string | null {
  if (!scope.startsWith("automation:")) return null;
  const guid = scope.slice("automation:".length);
  if (!guid || guid.includes(":") || guid === "standalone") return null;
  return guid;
}

export function isStandaloneAutomationScope(scope: string): boolean {
  const host = scope.includes("::space::")
    ? scope.slice(0, scope.indexOf("::space::"))
    : scope;
  return host === "automation:standalone" || parseStandaloneScope(host) !== null;
}

/** Overview / center-stage git, PR, and code-review widgets. */
export function shouldShowOverviewGitWidgets(scope: string): boolean {
  return !isStandaloneAutomationScope(scope);
}

export function standaloneJobHref(automationGuid: string): string {
  return `/automation?id=${encodeURIComponent(automationGuid)}`;
}

export function standaloneDefinitionDir(automationGuid: string): string {
  return `~/.atmos/data/automations/definitions/${automationGuid}`;
}

export function automationTerminalWindowName(runGuid: string): string {
  return `auto-${shortRunId(runGuid)}`;
}

export function automationTerminalTabValue(runGuid: string): string {
  return `terminal-tab:${automationTerminalWindowName(runGuid)}`;
}

export function automationChatTabValue(chatId: string): string {
  return `agent-chat:${chatId}`;
}

function landingTabQuery(
  run: Pick<AutomationRunDetail, "guid" | "surface_session_id">,
  mode: Exclude<AutomationExecuteMode, "headless">,
): string {
  if (mode === "chat") {
    const chatId = run.surface_session_id?.trim();
    const tab = chatId ? automationChatTabValue(chatId) : "chat";
    return `tab=${encodeURIComponent(tab)}`;
  }
  return `tab=${encodeURIComponent(automationTerminalTabValue(run.guid))}`;
}

export function runEnvironmentTarget(
  run: RunLandingFields,
  automation?: Pick<AutomationSummary, "guid" | "execute_mode" | "target_kind">,
): RunEnvironmentTarget | null {
  const scope = run.surface_scope_id ?? "";
  const standaloneGuid = parseStandaloneScope(scope) ?? (
    (run.target_kind === "standalone" || automation?.target_kind === "standalone")
      ? run.automation_guid
      : null
  );
  if (standaloneGuid) {
    return { kind: "standalone", id: standaloneGuid };
  }
  if (run.target_kind === "project" || (!run.workspace_guid && !run.created_workspace_guid && run.project_guid)) {
    const projectId = scope || run.project_guid;
    if (projectId) {
      return { kind: "project", id: projectId };
    }
  }
  const workspaceId = scope || run.created_workspace_guid || run.workspace_guid;
  if (workspaceId) {
    return { kind: "workspace", id: workspaceId };
  }
  return null;
}

export function runEnvironmentContextId(
  run: RunLandingFields,
  automation?: Pick<AutomationSummary, "guid" | "execute_mode" | "target_kind">,
): string | null {
  const target = runEnvironmentTarget(run, automation);
  if (!target) return null;
  if (target.kind === "standalone") return standaloneScopeId(target.id);
  return target.id;
}

export function runEnvironmentHref(
  run: RunLandingFields,
  tabQuery: string,
  automation?: Pick<AutomationSummary, "guid" | "execute_mode" | "target_kind">,
): string {
  const target = runEnvironmentTarget(run, automation);
  if (!target) {
    return `/automations?run=${encodeURIComponent(run.guid)}`;
  }
  if (target.kind === "standalone") {
    return `${standaloneJobHref(target.id)}&${tabQuery}`;
  }
  if (target.kind === "project") {
    return `/project?id=${encodeURIComponent(target.id)}&${tabQuery}`;
  }
  return `/workspace?id=${encodeURIComponent(target.id)}&${tabQuery}`;
}

/** Href for a user-initiated open (history, notification click). Do not auto-push this. */
export function runLandingHref(
  run: RunLandingFields,
  automation?: Pick<AutomationSummary, "guid" | "execute_mode" | "target_kind">,
): string {
  const mode = runSurfaceMode({
    execute_mode: run.execute_mode ?? automation?.execute_mode,
    surface_kind: run.surface_kind,
  });
  if (mode === "headless") {
    return `/automations?run=${encodeURIComponent(run.guid)}`;
  }
  return runEnvironmentHref(run, landingTabQuery(run, mode), automation);
}
