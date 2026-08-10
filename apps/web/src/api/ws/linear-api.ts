import type {
  LinearIssueListPagePayload,
  LinearLinkPayload,
  LinearRateLimitPayload,
  LinearStatusPayload,
} from "@atmos/api-types/ws/dto/linear";
import { hubAuthForLocalApi } from "@/api/hub-client";
import { wsRequest } from "@/api/ws/request";

export type LinearIssueListParams = {
  preset?: string;
  team_id?: string;
  project_id?: string;
  query?: string;
  first?: number;
  after?: string;
};

/** Public Linear OAuth client id (not a secret). Prefer NEXT_PUBLIC_ for web builds. */
export function linearOauthClientId(): string {
  return (
    process.env.NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID?.trim() ||
    process.env.LINEAR_OAUTH_CLIENT_ID?.trim() ||
    ""
  );
}

function withHubAuth<T extends Record<string, unknown>>(
  data: T,
): T & { hub_cookie: string; device_credential: string } {
  return { ...data, ...hubAuthForLocalApi() };
}

export const wsLinearApi = {
  status: (): Promise<LinearStatusPayload & { needs_hub_login?: boolean }> =>
    wsRequest("linear_status", withHubAuth({})),

  /** @deprecated Product path is OAuth only; kept for internal/tests. */
  connectApiKey: (api_key: string): Promise<LinearStatusPayload> =>
    wsRequest("linear_connect_api_key", withHubAuth({ api_key })),

  oauthStart: (shell: "desktop" | "web", web_origin?: string) => {
    const client_id = linearOauthClientId();
    if (!client_id) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID is not set. Add your Linear OAuth client id to the web env.",
        ),
      );
    }
    return wsRequest<{ authorize_url: string; state: string }>(
      "linear_oauth_start",
      { shell, web_origin, client_id },
    );
  },

  oauthFinish: (code: string, state: string): Promise<LinearStatusPayload> => {
    const client_id = linearOauthClientId();
    return wsRequest(
      "linear_oauth_finish",
      withHubAuth({ code, state, client_id: client_id || undefined }),
    );
  },

  disconnect: (): Promise<LinearStatusPayload> =>
    wsRequest("linear_disconnect", withHubAuth({})),

  rateLimit: (): Promise<LinearRateLimitPayload> =>
    wsRequest("linear_rate_limit", withHubAuth({})),

  issueList: (params: LinearIssueListParams = {}): Promise<LinearIssueListPagePayload> =>
    wsRequest("linear_issue_list", withHubAuth({ ...params })),

  filterOptions: (): Promise<{
    teams: Array<{ id: string; name: string; key: string }>;
    projects: Array<{ id: string; name: string }>;
  }> => wsRequest("linear_filter_options", withHubAuth({})),

  linkIssue: (workspace_guid: string, issue: unknown): Promise<LinearLinkPayload> =>
    wsRequest("linear_link_issue", { workspace_guid, issue }),

  unlinkIssue: (workspace_guid: string, external_id: string) =>
    wsRequest<{ ok: boolean }>("linear_unlink_issue", {
      workspace_guid,
      external_id,
    }),

  linksForWorkspace: (workspace_guid: string): Promise<LinearLinkPayload[]> =>
    wsRequest("linear_links_for_workspace", { workspace_guid }),
};
