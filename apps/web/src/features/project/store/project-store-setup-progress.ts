import type { WorkspaceModel } from "@/api/ws-api";

export interface WorkspaceSetupProgress {
  workspaceId: string;
  status: "creating" | "setting_up" | "completed" | "error";
  lastStatus?: "creating" | "setting_up" | "completed";
  stepKey?:
    | "create_worktree"
    | "write_requirement"
    | "extract_todos"
    | "run_setup_script"
    | "ready";
  lastStepKey?:
    | "create_worktree"
    | "write_requirement"
    | "extract_todos"
    | "run_setup_script"
    | "ready";
  failedStepKey?:
    | "create_worktree"
    | "write_requirement"
    | "extract_todos"
    | "run_setup_script"
    | "ready";
  stepTitle: string;
  output: string;
  replaceOutput?: boolean;
  requiresConfirmation?: boolean;
  success: boolean;
  countdown?: number;
  setupContext?: {
    hasGithubIssue: boolean;
    hasGithubPr: boolean;
    hasRequirementStep: boolean;
    autoExtractTodos: boolean;
    hasSetupScript: boolean;
  };
  retryContext?: {
    initialRequirement?: string | null;
    githubIssue?: WorkspaceModel["github_issue"];
    autoExtractTodos: boolean;
  };
}

interface WorkspaceSetupContextPayload {
  has_github_issue: boolean;
  has_github_pr: boolean;
  has_requirement_step: boolean;
  auto_extract_todos: boolean;
  has_setup_script: boolean;
}

export interface WorkspaceSetupProgressEventPayload {
  workspace_id: string;
  status: WorkspaceSetupProgress["status"];
  step_key?: WorkspaceSetupProgress["stepKey"];
  failed_step_key?: WorkspaceSetupProgress["failedStepKey"];
  step_title: string;
  output?: string;
  replace_output?: boolean;
  requires_confirmation?: boolean;
  success: boolean;
  countdown?: number;
  setup_context?: WorkspaceSetupContextPayload | null;
}

const SETUP_STEP_ORDER: Record<
  NonNullable<WorkspaceSetupProgress["stepKey"]>,
  number
> = {
  create_worktree: 0,
  write_requirement: 1,
  extract_todos: 2,
  run_setup_script: 3,
  ready: 4,
};

export function getSetupStepOrder(
  stepKey: WorkspaceSetupProgress["stepKey"] | WorkspaceSetupProgress["lastStepKey"],
): number {
  if (!stepKey) return -1;
  return SETUP_STEP_ORDER[stepKey] ?? -1;
}

function getInitialAsyncSetupState(input: {
  hasGithubIssue: boolean;
  hasRequirementStep: boolean;
  autoExtractTodos: boolean;
  hasSetupScript: boolean;
}): Pick<WorkspaceSetupProgress, "status" | "stepKey" | "stepTitle" | "success"> {
  // requirement.md is now pre-filled synchronously during workspace creation,
  // so the post-create flow no longer surfaces a "write_requirement" step.
  if (input.autoExtractTodos) {
    return {
      status: "creating",
      stepKey: "extract_todos",
      stepTitle: "Extracting Initial TODOs",
      success: true,
    };
  }

  if (input.hasSetupScript) {
    return {
      status: "setting_up",
      stepKey: "run_setup_script",
      stepTitle: "Running Setup Script",
      success: true,
    };
  }

  return {
    status: "completed",
    stepKey: "ready",
    stepTitle: "Ready to Build",
    success: true,
  };
}

export function buildInitialWorkspaceSetupProgress(input: {
  workspaceId: string;
  setupContext: WorkspaceSetupProgress["setupContext"];
  retryContext: WorkspaceSetupProgress["retryContext"];
}): WorkspaceSetupProgress {
  return {
    workspaceId: input.workspaceId,
    ...getInitialAsyncSetupState({
      hasGithubIssue: !!input.setupContext?.hasGithubIssue,
      hasRequirementStep: !!input.setupContext?.hasRequirementStep,
      autoExtractTodos: !!input.setupContext?.autoExtractTodos,
      hasSetupScript: !!input.setupContext?.hasSetupScript,
    }),
    output: "",
    setupContext: input.setupContext,
    retryContext: input.retryContext,
  };
}

export function isWorkspaceSetupProgressEventPayload(
  data: unknown,
): data is WorkspaceSetupProgressEventPayload {
  if (!data || typeof data !== "object") return false;

  const payload = data as Record<string, unknown>;
  const validStatus = ["creating", "setting_up", "completed", "error"];
  const validStepKeys = [
    "create_worktree",
    "write_requirement",
    "extract_todos",
    "run_setup_script",
    "ready",
  ];

  return (
    typeof payload.workspace_id === "string" &&
    typeof payload.step_title === "string" &&
    typeof payload.success === "boolean" &&
    typeof payload.status === "string" &&
    (payload.replace_output == null || typeof payload.replace_output === "boolean") &&
    (payload.requires_confirmation == null ||
      typeof payload.requires_confirmation === "boolean") &&
    (payload.setup_context == null ||
      (typeof payload.setup_context === "object" &&
        typeof (payload.setup_context as Record<string, unknown>).has_github_issue === "boolean" &&
        (typeof (payload.setup_context as Record<string, unknown>).has_github_pr === "boolean" ||
          (payload.setup_context as Record<string, unknown>).has_github_pr === undefined) &&
        typeof (payload.setup_context as Record<string, unknown>).has_requirement_step === "boolean" &&
        typeof (payload.setup_context as Record<string, unknown>).auto_extract_todos === "boolean" &&
        typeof (payload.setup_context as Record<string, unknown>).has_setup_script === "boolean")) &&
    (payload.step_key == null ||
      (typeof payload.step_key === "string" && validStepKeys.includes(payload.step_key))) &&
    (payload.failed_step_key == null ||
      (typeof payload.failed_step_key === "string" && validStepKeys.includes(payload.failed_step_key))) &&
    validStatus.includes(payload.status)
  );
}
