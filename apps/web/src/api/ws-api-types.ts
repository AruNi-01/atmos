/**
 * Web WS API response types.
 * Multi-client shared DTOs re-exported from `@atmos/api-types`.
 */
import type { WorkspaceModel } from "@atmos/api-types/ws/dto/workspace";
import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws/github-api";

export type {
  DiffContentKind,
  DiffPreviewKind,
  GitBlobLocator,
  GitChangedFile,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitFileDiffResponse,
  GitFilesDiffResponse,
  GitFilesDiffResult,
  GitGenerateCommitMessageResponse,
  GitGetStatusBatchResponse,
  GitGetStatusBatchResult,
  GitHistoryCommit,
  GitHistoryPage,
  GitHistoryRef,
  GitHistoryRefKind,
  GitPatchChunkResponse,
  GitStatusResponse,
} from "@atmos/api-types/ws/dto/git";

export type {
  FileTreeNode,
  FsCreateDirResponse,
  FsDeletePathResponse,
  FsDuplicatePathResponse,
  FsEntry,
  FsListDirResponse,
  FsListProjectFilesResponse,
  FsReadFileResponse,
  FsReadFilesResponse,
  FsReadFilesResult,
  FsRenamePathResponse,
  FsSearchContentResponse,
  FsSearchDirsResponse,
  FsValidateGitPathResponse,
  FsWriteFileResponse,
  SearchMatch,
} from "@atmos/api-types/ws/dto/fs";

export type {
  ProjectModel,
  ProjectScripts,
  ProjectWorkspaceBootstrapResponse,
} from "@atmos/api-types/ws/dto/project";

export type { GroupMemberModel, GroupModel } from "@atmos/api-types/ws/dto/group";

export type {
  WorkspaceCreateSourceModel,
  WorkspaceLabelModel,
  WorkspaceModel,
} from "@atmos/api-types/ws/dto/workspace";

export type { GithubIssuePayload, GithubPrPayload };

/** Web-specific archived list row (includes project_name). */
export interface ArchivedWorkspace {
  guid: string;
  name: string;
  display_name?: string | null;
  branch: string;
  base_branch: string;
  project_guid: string;
  project_name: string;
  archived_at: string;
}

/** App-level camelCase attachment before mapping to the snake_case wire type. */
export interface WorkspaceAttachmentView {
  filename: string;
  mime: string;
  dataBase64: string;
}

export interface AppOpenResponse {
  success: boolean;
  app_name: string;
  path: string;
}

export interface CanvasBridgeRegisterPayload {
  client_id: string;
  label?: string;
  accepts_commands?: boolean;
  capabilities?: string[];
  active_document_file_name?: string | null;
}

export interface CanvasAgentDispatchResultPayload {
  request_id: string;
  success: boolean;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
  data?: unknown;
}
