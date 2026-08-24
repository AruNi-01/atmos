import type { WsEmpty, WsSuccess } from "../dto/common";
import type { FsValidateGitPathRequest, FsValidateGitPathResponse } from "../dto/fs";
import type {
  ProjectCheckCanDeleteResponse,
  ProjectCreateRequest,
  ProjectGuidRequest,
  ProjectModel,
  ProjectScriptTrustRequest,
  ProjectScripts,
  ProjectUpdateOrderRequest,
  ProjectUpdateRequest,
  ProjectUpdateTargetBranchRequest,
  ProjectWorkspaceBootstrapResponse,
  ScriptGetRequest,
  ScriptSaveRequest,
} from "../dto/project";

export type ProjectContract = {
  project_workspace_bootstrap: {
    input: WsEmpty;
    output: ProjectWorkspaceBootstrapResponse;
  };
  project_list: { input: WsEmpty; output: ProjectModel[] };
  project_create: { input: ProjectCreateRequest; output: ProjectModel };
  project_update: { input: ProjectUpdateRequest; output: WsSuccess };
  project_update_target_branch: {
    input: ProjectUpdateTargetBranchRequest;
    output: WsSuccess;
  };
  project_update_order: { input: ProjectUpdateOrderRequest; output: WsSuccess };
  project_delete: { input: ProjectGuidRequest; output: WsSuccess };
  project_validate_path: {
    input: FsValidateGitPathRequest;
    output: FsValidateGitPathResponse;
  };
  project_check_can_delete: {
    input: ProjectGuidRequest;
    output: ProjectCheckCanDeleteResponse;
  };
  project_script_trust: {
    input: ProjectScriptTrustRequest;
    output: ProjectScripts;
  };
  script_get: { input: ScriptGetRequest; output: ProjectScripts };
  script_save: { input: ScriptSaveRequest; output: WsSuccess };
};
