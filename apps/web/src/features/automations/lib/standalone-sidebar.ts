import type { Project, Workspace } from "@/shared/types/domain";
import type { AutomationSummary } from "@/features/automations/types";
import {
  parseStandaloneScope,
  standaloneDefinitionDir,
  standaloneScopeId,
} from "@/features/automations/lib/automation-run-landing";

export const STANDALONE_GROUP_ID = "automation:standalone";

/** Synthetic job rows stay visible when the sidebar hides automation worktrees. */
export function isStandaloneSidebarJob(projectId: string, workspaceId: string): boolean {
  return projectId === STANDALONE_GROUP_ID || parseStandaloneScope(workspaceId) !== null;
}

export function buildStandaloneAutomationProject(
  automations: AutomationSummary[],
  groupName = "Automations Standalone",
): Project | null {
  const jobs = automations.filter((item) => item.target_kind === "standalone");
  if (jobs.length === 0) return null;
  return {
    id: STANDALONE_GROUP_ID,
    name: groupName,
    isOpen: true,
    workspaces: jobs.map((job) => standaloneJobWorkspace(job)),
    mainFilePath: "",
    sidebarOrder: Number.MAX_SAFE_INTEGER,
    borderColor: null,
    logoPath: null,
  };
}

export function mergeStandaloneAutomationProject(
  projects: Project[],
  automations: AutomationSummary[],
  groupName = "Automations Standalone",
): Project[] {
  const standalone = buildStandaloneAutomationProject(automations, groupName);
  const withoutSynth = projects.filter((project) => project.id !== STANDALONE_GROUP_ID);
  if (!standalone) return withoutSynth;
  return [...withoutSynth, standalone];
}

function standaloneJobWorkspace(job: AutomationSummary): Workspace {
  return {
    id: standaloneScopeId(job.guid),
    name: job.display_name,
    displayName: job.display_name,
    branch: "",
    baseBranch: "",
    isActive: false,
    status: "clean",
    projectId: STANDALONE_GROUP_ID,
    isPinned: false,
    isArchived: false,
    createdAt: "",
    workflowStatus: "backlog",
    priority: "no_priority",
    labels: [],
    localPath: standaloneDefinitionDir(job.guid),
    createSource: "automation",
  };
}
