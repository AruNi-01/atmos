/** Mobile API types — shared wire DTOs; mobile-only shapes stay here. */

export type {
  WsError,
  WsMessage,
  WsNotification,
  WsRequest,
  WsResponse,
} from "@atmos/api-types/ws/frames";
export type { WsAction } from "@atmos/api-types/ws/actions";

export type {
  FsEntry,
  FsListDirResponse,
  FsValidateGitPathResponse,
} from "@atmos/api-types/ws/dto/fs";
export type {
  GitChangedFile,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitFileDiffResponse,
  GitStatusResponse,
} from "@atmos/api-types/ws/dto/git";
export type {
  ProjectModel,
  ProjectWorkspaceBootstrapResponse,
} from "@atmos/api-types/ws/dto/project";
export type {
  WorkspaceLabelModel,
  WorkspaceModel,
} from "@atmos/api-types/ws/dto/workspace";
export type { GroupMemberModel, GroupModel } from "@atmos/api-types/ws/dto/group";
export type {
  GithubIssueLabelPayload,
  GithubIssuePayload,
  GithubPrPayload,
} from "@atmos/api-types/ws/dto/github";

export type {
  ClientSessionResponse,
  ComputerRow,
  RegisterTokenResponse,
} from "@atmos/relay-client";

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string | null;
  error?: string | null;
};

export type {
  TerminalWorkspaceCandidate,
  TerminalWorkspaceCandidatesResponse,
} from "@atmos/api-types/ws/dto/terminal";
export type {
  WorkspaceSetupContextNotification,
  WorkspaceSetupProgressNotification,
} from "@atmos/api-types/ws/dto/workspace";
