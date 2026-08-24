import type {
  LinearIssueListPagePayload,
  LinearLinkIssueRequest,
  LinearLinkPayload,
  LinearRateLimitPayload,
  LinearStatusPayload,
} from "@atmos/api-types/ws/dto/linear";
import { withHubAuth } from "@/api/hub-client";
import { getActiveLinearApiKeyForRequest } from "@/features/settings/lib/linear-local-keys";
import { wsRequest } from "@/api/ws/request";

export type LinearIssueListParams = {
  preset?: string;
  team_id?: string;
  project_id?: string;
  /** Linear workflow state types: backlog | unstarted | started | completed | canceled. */
  state_types?: string[];
  assignee_ids?: string[];
  label_ids?: string[];
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

/**
 * Attach unified Hub identity (+ optional local Linear API key).
 * Call sites never see cookie vs device.
 */
function withLinearAuth<T extends Record<string, unknown>>(
  data: T,
  opts?: { linearApiKey?: string | null },
): T & ReturnType<typeof withHubAuth> {
  // Explicit null/empty disables local key injection (OAuth / validate-only).
  const linearApiKey =
    opts && "linearApiKey" in opts
      ? opts.linearApiKey
      : getActiveLinearApiKeyForRequest() ?? null;
  const client_id = linearOauthClientId() || undefined;
  return withHubAuth(
    client_id ? { ...data, client_id } : data,
    { linearApiKey },
  );
}

export const wsLinearApi = {
  status: (opts?: {
    linearApiKey?: string | null;
  }): Promise<LinearStatusPayload & { needs_hub_login?: boolean }> =>
    wsRequest("linear_status", withLinearAuth({}, opts)),

  /** Validate a personal API key (does not store on Hub). */
  connectApiKey: (api_key: string): Promise<LinearStatusPayload> =>
    wsRequest(
      "linear_connect_api_key",
      withLinearAuth({ api_key }, { linearApiKey: null }),
    ),

  oauthStart: (shell: "desktop" | "web", web_origin?: string) => {
    const client_id = linearOauthClientId();
    if (!client_id) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID is not set. Add your Linear OAuth client id to the web env.",
        ),
      );
    }
    return wsRequest("linear_oauth_start", {
      shell,
      web_origin,
      client_id,
    });
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
    wsRequest("linear_disconnect", withLinearAuth({}, { linearApiKey: null })),

  rateLimit: (opts?: {
    linearApiKey?: string | null;
  }): Promise<LinearRateLimitPayload> =>
    wsRequest("linear_rate_limit", withLinearAuth({}, opts)),

  issueList: (
    params: LinearIssueListParams = {},
  ): Promise<LinearIssueListPagePayload> =>
    wsRequest("linear_issue_list", withLinearAuth({ ...params })),

  filterOptions: (): Promise<{
    teams: Array<{ id: string; name: string; key: string }>;
    projects: Array<{ id: string; name: string }>;
    users: Array<{ id: string; name: string; avatar_url?: string | null }>;
    labels: Array<{ id: string; name: string; color?: string | null }>;
  }> => wsRequest("linear_filter_options", withLinearAuth({})),

  linkIssue: (
    workspace_guid: string,
    issue: LinearLinkIssueRequest["issue"],
  ): Promise<LinearLinkPayload> =>
    wsRequest("linear_link_issue", { workspace_guid, issue }),

  unlinkIssue: (workspace_guid: string, external_id: string) =>
    wsRequest("linear_unlink_issue", {
      workspace_guid,
      external_id,
    }),

  linksForWorkspace: (workspace_guid: string): Promise<LinearLinkPayload[]> =>
    wsRequest("linear_links_for_workspace", { workspace_guid }),
};
