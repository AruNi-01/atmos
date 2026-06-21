import type {
  FsListDirResponse,
  FsValidateGitPathResponse,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitFileDiffResponse,
  GitStatusResponse,
  GithubIssuePayload,
  GithubPrPayload,
  ProjectModel,
  ProjectWorkspaceBootstrapResponse,
  TerminalWorkspaceCandidatesResponse,
  WorkspaceModel,
  WorkspaceSetupProgressNotification,
} from "@/api/types";
import type { MobileWsClient } from "@/api/mobile-ws-client";

export const wsActions = {
  projectWorkspaceBootstrap(client: MobileWsClient) {
    return client.request<ProjectWorkspaceBootstrapResponse>("project_workspace_bootstrap");
  },
  fsGetHomeDir(client: MobileWsClient) {
    return client.request<{ path: string }>("fs_get_home_dir");
  },
  fsListDir(client: MobileWsClient, path: string, dirsOnly = true) {
    return client.request<FsListDirResponse>("fs_list_dir", {
      path,
      dirs_only: dirsOnly,
    });
  },
  fsSearchDirs(client: MobileWsClient, rootPath: string, query: string) {
    return client.request<{ entries: FsListDirResponse["entries"] }>("fs_search_dirs", {
      root_path: rootPath,
      query,
      max_results: 25,
      max_depth: 4,
    });
  },
  fsValidateGitPath(client: MobileWsClient, path: string) {
    return client.request<FsValidateGitPathResponse>("fs_validate_git_path", { path });
  },
  projectCreate(client: MobileWsClient, payload: { name: string; main_file_path: string }) {
    return client.request<ProjectModel>("project_create", {
      ...payload,
      sidebar_order: 0,
    });
  },
  workspaceCreate(
    client: MobileWsClient,
    payload: {
      project_guid: string;
      name: string;
      display_name: string;
      branch: string;
      base_branch: string | null;
      github_issue?: GithubIssuePayload | null;
      github_pr?: GithubPrPayload | null;
      auto_extract_todos?: boolean;
      priority?: string | null;
      workflow_status?: string | null;
      label_guids?: string[];
    },
  ) {
    return client.request<WorkspaceModel>("workspace_create", {
      initial_requirement: null,
      attachments: [],
      sidebar_order: 0,
      auto_extract_todos: false,
      github_issue: null,
      github_pr: null,
      priority: "no_priority",
      workflow_status: "in_progress",
      label_guids: [],
      ...payload,
    });
  },
  workspaceConfirmTodos(client: MobileWsClient, guid: string, markdown: string) {
    return client.request<{ success: boolean }>("workspace_confirm_todos", {
      guid,
      markdown,
    });
  },
  workspaceUpdateWorkflowStatus(client: MobileWsClient, guid: string, workflowStatus: string) {
    return client.request<{ success: boolean }>("workspace_update_workflow_status", {
      guid,
      workflow_status: workflowStatus,
    });
  },
  workspaceRetrySetup(
    client: MobileWsClient,
    payload: {
      guid: string;
      failed_step_key: string;
      initial_requirement?: string | null;
      github_issue?: GithubIssuePayload | null;
      github_pr?: GithubPrPayload | null;
      auto_extract_todos?: boolean;
    },
  ) {
    return client.request<{ success: boolean }>("workspace_retry_setup", {
      initial_requirement: null,
      github_issue: null,
      github_pr: null,
      auto_extract_todos: false,
      ...payload,
    });
  },
  githubIssueGet(client: MobileWsClient, issueUrl: string) {
    return client.request<GithubIssuePayload>("github_issue_get", {
      issue_url: issueUrl,
    });
  },
  githubPrGet(client: MobileWsClient, prUrl: string) {
    return client.request<GithubPrPayload>("github_pr_get", {
      pr_url: prUrl,
    });
  },
  gitGetStatus(client: MobileWsClient, path: string) {
    return client.request<GitStatusResponse>("git_get_status", { path });
  },
  gitChangedFiles(client: MobileWsClient, path: string, baseBranch?: string | null, usePreferredCompare = false) {
    return client.request<GitChangedFilesResponse>("git_changed_files", {
      path,
      base_branch: baseBranch ?? null,
      use_preferred_compare: usePreferredCompare,
    });
  },
  gitFileDiff(
    client: MobileWsClient,
    path: string,
    filePath: string,
    baseBranch?: string | null,
    againstIndex = false,
  ) {
    return client.request<GitFileDiffResponse>("git_file_diff", {
      path,
      file_path: filePath,
      base_branch: baseBranch ?? null,
      against_index: againstIndex,
    });
  },
  gitStage(client: MobileWsClient, path: string, files: string[]) {
    return client.request<{ success: boolean }>("git_stage", { path, files });
  },
  gitUnstage(client: MobileWsClient, path: string, files: string[]) {
    return client.request<{ success: boolean }>("git_unstage", { path, files });
  },
  gitCommit(client: MobileWsClient, path: string, message: string) {
    return client.request<GitCommitResponse>("git_commit", { path, message });
  },
  gitPush(client: MobileWsClient, path: string) {
    return client.request<{ success: boolean }>("git_push", { path });
  },
  terminalWorkspaceCandidates(
    client: MobileWsClient,
    payload: {
      workspace_id: string;
      project_name?: string | null;
      workspace_name?: string | null;
    },
  ) {
    return client.request<TerminalWorkspaceCandidatesResponse>("terminal_workspace_candidates", payload);
  },
};

export function isWorkspaceSetupProgressNotification(
  data: unknown,
): data is WorkspaceSetupProgressNotification {
  if (!data || typeof data !== "object") return false;
  const payload = data as Record<string, unknown>;

  return (
    typeof payload.workspace_id === "string" &&
    typeof payload.status === "string" &&
    ["creating", "setting_up", "completed", "error"].includes(payload.status) &&
    typeof payload.step_title === "string" &&
    typeof payload.success === "boolean" &&
    (payload.output == null || typeof payload.output === "string") &&
    (payload.step_key == null || typeof payload.step_key === "string") &&
    (payload.failed_step_key == null || typeof payload.failed_step_key === "string") &&
    (payload.replace_output == null || typeof payload.replace_output === "boolean") &&
    (payload.requires_confirmation == null || typeof payload.requires_confirmation === "boolean") &&
    (payload.countdown == null || typeof payload.countdown === "number")
  );
}
