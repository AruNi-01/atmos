import type { WorkspaceSetupProgress } from "@/hooks/use-project-store";

export type WorkspaceSetupStepKey = NonNullable<WorkspaceSetupProgress["stepKey"]>;
type WorkspaceSetupStepSummary = {
  id: WorkspaceSetupStepKey;
  title: string;
};

export function fallbackWorkspaceSetupStepKey(
  status: WorkspaceSetupProgress["status"] | WorkspaceSetupProgress["lastStatus"],
): WorkspaceSetupStepKey {
  switch (status) {
    case "completed":
      return "ready";
    case "setting_up":
      return "run_setup_script";
    default:
      return "create_worktree";
  }
}

export function getWorkspaceSetupCurrentStepKey(
  progress: WorkspaceSetupProgress,
): WorkspaceSetupStepKey {
  if (progress.status === "completed") {
    return "ready";
  }

  if (progress.status === "error") {
    return (
      progress.stepKey ??
      progress.failedStepKey ??
      progress.lastStepKey ??
      fallbackWorkspaceSetupStepKey(progress.lastStatus)
    );
  }

  return progress.stepKey ?? fallbackWorkspaceSetupStepKey(progress.status);
}

export function isWorkspaceSetupBlocking(
  progress: WorkspaceSetupProgress | null | undefined,
): boolean {
  if (!progress || progress.status === "completed") {
    return false;
  }

  return getWorkspaceSetupCurrentStepKey(progress) === "create_worktree";
}

export function getWorkspaceSetupSteps(
  progress: WorkspaceSetupProgress,
): WorkspaceSetupStepSummary[] {
  const steps: WorkspaceSetupStepSummary[] = [
    {
      id: "create_worktree",
      title: "Create Workspace",
    },
  ];

  // requirement.md is pre-filled synchronously during workspace creation, so
  // this step is shown only as a record (already-completed) when the user
  // linked a PR/Issue or supplied an initial requirement via the composer.
  if (
    progress.setupContext?.hasGithubPr ||
    progress.setupContext?.hasGithubIssue ||
    progress.setupContext?.hasRequirementStep
  ) {
    steps.push({
      id: "write_requirement",
      title: progress.setupContext?.hasGithubPr
        ? "Fill PR Spec"
        : progress.setupContext?.hasGithubIssue
          ? "Fill Issue Spec"
          : "Write Requirement Spec",
    });
  }

  if (progress.setupContext?.autoExtractTodos) {
    steps.push({
      id: "extract_todos",
      title: "Extract TODOs",
    });
  }

  if (
    progress.setupContext?.hasSetupScript ||
    progress.status === "setting_up" ||
    progress.stepKey === "run_setup_script" ||
    progress.lastStepKey === "run_setup_script"
  ) {
    steps.push({
      id: "run_setup_script",
      title: "Run Setup Script",
    });
  }

  steps.push({
    id: "ready",
    title: "Ready",
  });

  return steps;
}

export function getWorkspaceSetupProgressValue(progress: WorkspaceSetupProgress): number {
  const steps = getWorkspaceSetupSteps(progress);
  const currentStepKey = getWorkspaceSetupCurrentStepKey(progress);
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepKey),
  );

  if (progress.status === "completed") {
    return 100;
  }

  return (currentStepIndex + 0.5) * (100 / Math.max(1, steps.length));
}
