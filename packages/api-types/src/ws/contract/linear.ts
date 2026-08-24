import type { WsOk } from "../dto/common";
import type {
  HubSessionFields,
  LinearClientHubRequest,
  LinearConnectApiKeyRequest,
  LinearFilterOptionsResponse,
  LinearIssueListPagePayload,
  LinearIssueListRequest,
  LinearLinkIssueRequest,
  LinearLinkPayload,
  LinearLinksForWorkspaceRequest,
  LinearOauthFinishRequest,
  LinearOauthStartRequest,
  LinearOauthStartResponse,
  LinearRateLimitPayload,
  LinearStatusPayload,
  LinearUnlinkIssueRequest,
} from "../dto/linear";

export type LinearContract = {
  linear_status: { input: HubSessionFields; output: LinearStatusPayload };
  linear_connect_api_key: {
    input: LinearConnectApiKeyRequest;
    output: LinearStatusPayload;
  };
  linear_oauth_start: {
    input: LinearOauthStartRequest;
    output: LinearOauthStartResponse;
  };
  linear_oauth_finish: {
    input: LinearOauthFinishRequest;
    output: LinearStatusPayload;
  };
  linear_disconnect: { input: HubSessionFields; output: LinearStatusPayload };
  linear_rate_limit: {
    input: LinearClientHubRequest;
    output: LinearRateLimitPayload;
  };
  linear_issue_list: {
    input: LinearIssueListRequest;
    output: LinearIssueListPagePayload;
  };
  linear_filter_options: {
    input: LinearClientHubRequest;
    output: LinearFilterOptionsResponse;
  };
  linear_link_issue: {
    input: LinearLinkIssueRequest;
    output: LinearLinkPayload;
  };
  linear_unlink_issue: { input: LinearUnlinkIssueRequest; output: WsOk };
  linear_links_for_workspace: {
    input: LinearLinksForWorkspaceRequest;
    output: LinearLinkPayload[];
  };
};
