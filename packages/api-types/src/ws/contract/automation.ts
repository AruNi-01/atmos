import type { WsEmpty, WsOk } from "../dto/common";
import type {
  AutomationAgentCapabilitiesResponse,
  AutomationArtifactGetRequest,
  AutomationArtifactResponse,
  AutomationContinueInTerminalResponse,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationGithubRelayRequest,
  AutomationGuidRequest,
  AutomationListRequest,
  AutomationListResponse,
  AutomationRunDetail,
  AutomationRunGuidRequest,
  AutomationRunListRequest,
  AutomationRunListResponse,
  AutomationSchedulePreviewRequest,
  AutomationSchedulePreviewResponse,
  AutomationUpdateRequest,
} from "../dto/automation";

export type AutomationContract = {
  automation_list: {
    input: AutomationListRequest;
    output: AutomationListResponse;
  };
  automation_get: { input: AutomationGuidRequest; output: AutomationDetail };
  automation_create: {
    input: AutomationCreateRequest;
    output: AutomationDetail;
  };
  automation_update: {
    input: AutomationUpdateRequest;
    output: AutomationDetail;
  };
  automation_delete: { input: AutomationGuidRequest; output: WsOk };
  automation_run_now: {
    input: AutomationGuidRequest;
    output: AutomationRunDetail;
  };
  automation_pause: { input: AutomationGuidRequest; output: AutomationDetail };
  automation_resume: { input: AutomationGuidRequest; output: AutomationDetail };
  automation_cancel_run: {
    input: AutomationRunGuidRequest;
    output: AutomationRunDetail;
  };
  automation_run_list: {
    input: AutomationRunListRequest;
    output: AutomationRunListResponse;
  };
  automation_run_get: {
    input: AutomationRunGuidRequest;
    output: AutomationRunDetail;
  };
  automation_artifact_get: {
    input: AutomationArtifactGetRequest;
    output: AutomationArtifactResponse;
  };
  automation_continue_in_terminal: {
    input: AutomationRunGuidRequest;
    output: AutomationContinueInTerminalResponse;
  };
  automation_agent_capabilities: {
    input: WsEmpty;
    output: AutomationAgentCapabilitiesResponse;
  };
  automation_schedule_preview: {
    input: AutomationSchedulePreviewRequest;
    output: AutomationSchedulePreviewResponse;
  };
  automation_github_setup_session: {
    input: AutomationGithubRelayRequest;
    output: unknown;
  };
  automation_github_installations: {
    input: AutomationGithubRelayRequest;
    output: unknown;
  };
  automation_github_repositories: {
    input: AutomationGithubRelayRequest;
    output: unknown;
  };
  automation_github_event_route_upsert: {
    input: AutomationGithubRelayRequest;
    output: unknown;
  };
  automation_github_event_route_delete: {
    input: AutomationGithubRelayRequest;
    output: unknown;
  };
};
