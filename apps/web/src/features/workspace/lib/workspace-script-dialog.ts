export const WORKSPACE_SCRIPT_PHASES = ["setup", "run", "purge"] as const;

export type WorkspaceScriptPhase = (typeof WORKSPACE_SCRIPT_PHASES)[number];

export type WorkspaceScripts = Record<WorkspaceScriptPhase, string>;

export const WORKSPACE_SCRIPT_ENV_VARS = [
  {
    id: "rootProjectPath",
    token: "$ATMOS_ROOT_PROJECT_PATH",
  },
  {
    id: "workspaceName",
    token: "$ATMOS_WORKSPACE_NAME",
  },
  {
    id: "workspacePath",
    token: "$ATMOS_WORKSPACE_PATH",
  },
] as const;

export type WorkspaceScriptEnvVarId = (typeof WORKSPACE_SCRIPT_ENV_VARS)[number]["id"];

export type WorkspaceScriptPhaseStatus = "empty" | "set" | "edited";

export function emptyWorkspaceScripts(): WorkspaceScripts {
  return { setup: "", run: "", purge: "" };
}

export function scriptsAreDirty(
  current: WorkspaceScripts,
  initial: WorkspaceScripts | null,
): boolean {
  if (!initial) return false;
  return WORKSPACE_SCRIPT_PHASES.some((phase) => current[phase] !== initial[phase]);
}

export function phaseStatus(
  current: string,
  initial: string | undefined,
): WorkspaceScriptPhaseStatus {
  if (initial !== undefined && current !== initial) return "edited";
  return current.trim().length > 0 ? "set" : "empty";
}

export function countScriptLines(value: string): number {
  if (value.length === 0) return 0;
  return value.replace(/\n$/, "").split("\n").length;
}

export function insertTokenAtSelection(
  value: string,
  start: number,
  end: number,
  token: string,
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const needsLead = from > 0 && !/\s/.test(value[from - 1] ?? "");
  const needsTrail = to < value.length && !/\s/.test(value[to] ?? "");
  const insertion = `${needsLead ? " " : ""}${token}${needsTrail ? " " : ""}`;
  return {
    value: `${value.slice(0, from)}${insertion}${value.slice(to)}`,
    caret: from + insertion.length,
  };
}
