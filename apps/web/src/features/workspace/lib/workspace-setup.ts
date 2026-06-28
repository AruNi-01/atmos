import type { WorkspaceSetupProgress } from "@/features/project/store/use-project-store";
import { createTranslator } from 'next-intl';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

export type WorkspaceSetupStepKey = NonNullable<WorkspaceSetupProgress["stepKey"]>;
type WorkspaceSetupStepSummary = {
  id: WorkspaceSetupStepKey;
  title: string;
};

let cachedRuntimeLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRuntimeTranslator: any = null;

function runtimeT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'project.runtime',
    });
  }
  return cachedRuntimeTranslator(key as never);
}

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
      title: runtimeT('workspaceSetup.steps.createWorkspace'),
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
        ? runtimeT('workspaceSetup.steps.fillPrSpec')
        : progress.setupContext?.hasGithubIssue
          ? runtimeT('workspaceSetup.steps.fillIssueSpec')
          : runtimeT('workspaceSetup.steps.writeRequirementSpec'),
    });
  }

  if (progress.setupContext?.autoExtractTodos) {
    steps.push({
      id: "extract_todos",
      title: runtimeT('workspaceSetup.steps.extractTodos'),
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
      title: runtimeT('workspaceSetup.steps.runSetupScript'),
    });
  }

  steps.push({
    id: "ready",
    title: runtimeT('workspaceSetup.steps.ready'),
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
