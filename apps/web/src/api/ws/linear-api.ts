import type {
  LinearIssueListPagePayload,
  LinearLinkPayload,
  LinearRateLimitPayload,
  LinearStatusPayload,
} from "@atmos/api-types/ws/dto/linear";
import { hubAuthForLocalApi } from "@/api/hub-client";
import { getActiveLinearApiKeyForRequest } from "@/features/settings/lib/linear-local-keys";
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

type LinearAuthFields = {
  hub_cookie: string;
  device_credential: string;
  linear_api_key?: string;
};

function withLinearAuth<T extends Record<string, unknown>>(
  data: T,
  opts?: { linearApiKey?: string | null },
): T & LinearAuthFields {
  const hub = hubAuthForLocalApi();
  // Explicit null/empty disables local key injection (OAuth / validate-only).
  const key =
    opts && "linearApiKey" in opts
      ? opts.linearApiKey?.trim() || undefined
      : getActiveLinearApiKeyForRequest() || undefined;
  return {
    ...data,
    hub_cookie: hub.hub_cookie,
    device_credential: hub.device_credential,
    ...(key ? { linear_api_key: key } : {}),
  };
}

export const wsLinearApi = {
  status: (opts?: {
    linearApiKey?: string | null;
  }): Promise<LinearStatusPayload & { needs_hub_login?: boolean }> =>
    wsRequest("linear_status", withLinearAuth({}, opts)),

  /** Validate a personal API key (does not store on Hub). */
  connectApiKey: (api_key: string): Promise<LinearStatusPayload> =>
    wsRequest("linear_connect_api_key", withLinearAuth({ api_key }, { linearApiKey: null })),

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
      withLinearAuth(
        { code, state, client_id: client_id || undefined },
        { linearApiKey: null },
      ),
    );
  },

  disconnect: (): Promise<LinearStatusPayload> =>
    wsRequest(
      "linear_disconnect",
      withLinearAuth({}, { linearApiKey: null }),
    ),

  rateLimit: (opts?: {
    linearApiKey?: string | null;
  }): Promise<LinearRateLimitPayload> =>
    wsRequest("linear_rate_limit", withLinearAuth({}, opts)),

  issueList: (params: LinearIssueListParams = {}): Promise<LinearIssueListPagePayload> =>
    wsRequest("linear_issue_list", withLinearAuth({ ...params })),

  filterOptions: (): Promise<{
    teams: Array<{ id: string; name: string; key: string }>;
    projects: Array<{ id: string; name: string }>;
  }> => wsRequest("linear_filter_options", withLinearAuth({})),

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
