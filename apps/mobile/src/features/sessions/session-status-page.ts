import type { AgentSessionStatusListRequest } from "@atmos/api-types/ws/dto/agent-status";
import { LIST_PAGE_SIZE } from "@/features/lists/list-page";

/** Home inbox page. Filtered screens use `LIST_PAGE_SIZE` instead. */
export const UNFILTERED_SESSION_PAGE_LIMIT = 100;

export function agentSessionStatusQueryKey(input: {
  serverId: string | null;
  groupKey?: string | null;
  contextId?: string | null;
  limit?: number | null;
  providerIds?: readonly string[] | null;
}): readonly (string | number | null)[] {
  const groupKey = nonempty(input.groupKey);
  const contextId = nonempty(input.contextId);
  const providers = providerKey(input.providerIds);
  const filtered = groupKey != null || contextId != null;
  const limit = input.limit ?? (filtered ? LIST_PAGE_SIZE : UNFILTERED_SESSION_PAGE_LIMIT);
  if (!filtered && limit === UNFILTERED_SESSION_PAGE_LIMIT && providers.length === 0) {
    return ["agent-session-status-list", input.serverId];
  }
  const key: (string | number | null)[] = [
    "agent-session-status-list",
    input.serverId,
    groupKey,
    contextId,
    limit,
  ];
  if (providers.length > 0) key.push(providers.join("\n"));
  return key;
}

export function agentSessionStatusListInput(input: {
  cursor?: string | null;
  groupKey?: string | null;
  contextId?: string | null;
  limit?: number | null;
  providerIds?: readonly string[] | null;
}): AgentSessionStatusListRequest {
  const groupKey = nonempty(input.groupKey);
  const contextId = nonempty(input.contextId);
  const providers = providerKey(input.providerIds);
  const filtered = groupKey != null || contextId != null;
  const body: AgentSessionStatusListRequest = {
    cursor: input.cursor ?? null,
    limit: input.limit ?? (filtered ? LIST_PAGE_SIZE : UNFILTERED_SESSION_PAGE_LIMIT),
  };
  if (groupKey) body.group_key = groupKey;
  if (contextId) body.context_id = contextId;
  if (providers.length > 0) body.provider_ids = providers;
  return body;
}

/** Drop one session from every loaded page. Used by `setQueriesData` on the status prefix. */
export function omitSessionFromStatusPages<
  T extends { pages?: { sessions: { session_id: string }[] }[] },
>(current: T | undefined, sessionId: string): T | undefined {
  if (!current?.pages) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      sessions: page.sessions.filter((session) => session.session_id !== sessionId),
    })),
  };
}

function nonempty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function providerKey(ids: readonly string[] | null | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0))].sort();
}
