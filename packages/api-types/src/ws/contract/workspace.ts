import type { WsEmpty, WsOk, WsSuccess } from "../dto/common";
import type {
  ArchivedWorkspaceListResponse,
  GitIgnoreDirsConfig,
  WorkspaceConfirmTodosRequest,
  WorkspaceCreateRequest,
  WorkspaceGuidRequest,
  WorkspaceLabelCreateRequest,
  WorkspaceLabelListRequest,
  WorkspaceLabelModel,
  WorkspaceLabelUpdateRequest,
  WorkspaceListRequest,
  WorkspaceModel,
  WorkspaceRetrySetupRequest,
  WorkspaceSkipSetupStepRequest,
  WorkspaceUpdateBranchRequest,
  WorkspaceUpdateLabelsRequest,
  WorkspaceUpdateNameRequest,
  WorkspaceUpdateOrderRequest,
  WorkspaceUpdatePinOrderRequest,
  WorkspaceUpdatePriorityRequest,
  WorkspaceUpdateWorkflowStatusRequest,
} from "../dto/workspace";

export type WorkspaceContract = {
  workspace_list: { input: WorkspaceListRequest; output: WorkspaceModel[] };
  workspace_create: { input: WorkspaceCreateRequest; output: WorkspaceModel };
  workspace_update_name: {
    input: WorkspaceUpdateNameRequest;
    output: WsSuccess;
  };
  workspace_update_branch: {
    input: WorkspaceUpdateBranchRequest;
    output: WsSuccess;
  };
  workspace_update_workflow_status: {
    input: WorkspaceUpdateWorkflowStatusRequest;
    output: WsSuccess;
  };
  workspace_update_priority: {
    input: WorkspaceUpdatePriorityRequest;
    output: WsSuccess;
  };
  workspace_label_list: {
    input: WorkspaceLabelListRequest;
    output: WorkspaceLabelModel[];
  };
  workspace_label_create: {
    input: WorkspaceLabelCreateRequest;
    output: WorkspaceLabelModel;
  };
  workspace_label_update: {
    input: WorkspaceLabelUpdateRequest;
    output: WorkspaceLabelModel;
  };
  workspace_label_delete: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_label_restore: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_update_labels: {
    input: WorkspaceUpdateLabelsRequest;
    output: WsSuccess;
  };
  workspace_update_order: {
    input: WorkspaceUpdateOrderRequest;
    output: WsSuccess;
  };
  workspace_mark_visited: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_delete: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_pin: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_unpin: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_update_pin_order: {
    input: WorkspaceUpdatePinOrderRequest;
    output: WsSuccess;
  };
  workspace_archive: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_unarchive: { input: WorkspaceGuidRequest; output: WsSuccess };
  workspace_list_archived: {
    input: WsEmpty;
    output: ArchivedWorkspaceListResponse;
  };
  workspace_retry_setup: {
    input: WorkspaceRetrySetupRequest;
    output: WsSuccess;
  };
  workspace_skip_setup_step: {
    input: WorkspaceSkipSetupStepRequest;
    output: WsSuccess;
  };
  workspace_skip_setup_script: {
    input: WorkspaceGuidRequest;
    output: WsSuccess;
  };
  workspace_confirm_todos: {
    input: WorkspaceConfirmTodosRequest;
    output: WsSuccess;
  };
  workspace_gitignore_dirs_get: {
    input: WsEmpty;
    output: GitIgnoreDirsConfig;
  };
  workspace_gitignore_dirs_update: {
    input: GitIgnoreDirsConfig;
    output: WsOk;
  };
};
