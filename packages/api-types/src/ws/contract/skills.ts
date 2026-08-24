import type { WsEmpty, WsSuccess } from "../dto/common";
import type {
  ReviewSkillsListResponse,
  ReviewSkillsScaffoldResponse,
  SkillInfo,
  SkillInstalledResponse,
  SkillsDeleteRequest,
  SkillsGetRequest,
  SkillsListRequest,
  SkillsListResponse,
  SkillsSetEnabledRequest,
  SkillsSystemSyncResponse,
  SkillScopeRoot,
  SyncSingleSystemSkillRequest,
  WikiSkillInstallResponse,
} from "../dto/skills";

export type SkillsContract = {
  skills_list: { input: SkillsListRequest; output: SkillsListResponse };
  skills_get: { input: SkillsGetRequest; output: SkillInfo };
  skills_set_enabled: { input: SkillsSetEnabledRequest; output: WsSuccess };
  skills_scan_root: { input: SkillScopeRoot; output: SkillsListResponse };
  skills_delete: { input: SkillsDeleteRequest; output: WsSuccess };
  wiki_skill_install: { input: WsEmpty; output: WikiSkillInstallResponse };
  wiki_skill_system_status: { input: WsEmpty; output: SkillInstalledResponse };
  code_review_skill_system_status: {
    input: WsEmpty;
    output: SkillInstalledResponse;
  };
  git_commit_skill_system_status: {
    input: WsEmpty;
    output: SkillInstalledResponse;
  };
  sync_single_system_skill: {
    input: SyncSingleSystemSkillRequest;
    output: WsSuccess;
  };
  skills_system_sync: { input: WsEmpty; output: SkillsSystemSyncResponse };
  review_skills_list: { input: WsEmpty; output: ReviewSkillsListResponse };
  review_skills_scaffold: {
    input: WsEmpty;
    output: ReviewSkillsScaffoldResponse;
  };
};
