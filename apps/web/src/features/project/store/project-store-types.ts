import type { WorkspaceAttachmentPayload, WorkspaceModel } from "@/api/ws-api";
import type {
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import type { WorkspaceSetupProgress } from "./project-store-setup-progress";

export interface ProjectStore {
  projects: Project[];
  workspaceLabels: WorkspaceLabel[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  connectionEpoch: number;

  fetchProjects: () => Promise<void>;
  resetForConnectionChange: () => void;
  addProject: (data: { name: string; mainFilePath: string; sidebarOrder?: number; borderColor?: string }) => Promise<void>;
  updateProject: (
    id: string,
    data: Partial<Omit<Project, "borderColor" | "logoPath">> & {
      borderColor?: string | null;
      logoPath?: string | null;
    },
  ) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  addWorkspace: (data: {
    projectId: string;
    name: string;
    displayName?: string | null;
    branch: string;
    baseBranch?: string | null;
    initialRequirement?: string | null;
    githubIssue?: WorkspaceModel["github_issue"];
    githubPr?: WorkspaceModel["github_pr"];
    autoExtractTodos?: boolean;
    hasSetupScript?: boolean;
    priority?: WorkspacePriority;
    workflowStatus?: WorkspaceWorkflowStatus;
    labels?: WorkspaceLabel[];
    attachments?: WorkspaceAttachmentPayload[];
  }) => Promise<string>;
  quickAddWorkspace: (projectId: string) => Promise<string | null>;
  deleteWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  pinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  unpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  archiveWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  updateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
  updateWorkspaceBranch: (projectId: string, workspaceId: string, branch: string) => Promise<void>;
  updateWorkspaceWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => Promise<void>;
  updateWorkspacePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => Promise<void>;
  fetchWorkspaceLabels: (deletedOnly?: boolean) => Promise<void>;
  createWorkspaceLabel: (data: { name: string; color: string; source?: "manual" | "gitHub_issue" | "gitHub_pr" }) => Promise<WorkspaceLabel>;
  updateWorkspaceLabel: (
    labelId: string,
    data: { name: string; color: string },
  ) => Promise<WorkspaceLabel>;
  deleteWorkspaceLabel: (labelId: string) => Promise<void>;
  restoreWorkspaceLabel: (labelId: string) => Promise<void>;
  updateWorkspaceLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  markWorkspaceVisited: (workspaceId: string) => Promise<void>;
  addWorkspacesToProject: (projectId: string, workspaceGuids: string[]) => Promise<void>;

  updateWorkspacePinOrder: (orderedWorkspaceIds: string[]) => Promise<void>;
  reorderProjects: (newOrder: Project[]) => Promise<void>;
  reorderWorkspaces: (projectId: string, newOrder: Workspace[]) => Promise<void>;

  setActiveWorkspaceId: (id: string | null) => void;

  setupProgress: Record<string, WorkspaceSetupProgress>;
  setSetupProgress: (progress: WorkspaceSetupProgress) => void;
  clearSetupProgress: (workspaceId: string) => void;
  retryWorkspaceSetup: (workspaceId: string) => Promise<void>;
}

export type ProjectStoreSet = (
  partial:
    | Partial<ProjectStore>
    | ProjectStore
    | ((state: ProjectStore) => Partial<ProjectStore> | ProjectStore),
) => void;

export type ProjectStoreGet = () => ProjectStore;
