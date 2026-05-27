"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  agentApi,
  type AgentCapabilities,
  type ListAgentSessionsResponse,
  type NativeAgentSessionItem,
} from "@/api/rest-api";
import { parseAuthRequiredError } from "@/features/agent/lib/agent-runtime-socket";

export const ACP_SESSION_LIST_PAGE_LIMIT = 20;

export type AcpSessionListMeta = Omit<ListAgentSessionsResponse, "items">;

export function getResumeUnsupportedReason(capabilities: AgentCapabilities | null | undefined): string | null {
  if (!capabilities) return null;
  if (capabilities.session_resume.supported || capabilities.load_session.supported) {
    return null;
  }
  return (
    capabilities.session_resume.reason ??
    capabilities.load_session.reason ??
    "This agent does not support resuming listed sessions"
  );
}

export function getListUnsupportedReason(error: unknown): string | null {
  return parseAuthRequiredError(error)
    ? "Authentication is required before this agent can list ACP sessions."
    : null;
}

export function useAcpSessionList({
  registryId,
  authMethodId = null,
  enabled = true,
  limit = ACP_SESSION_LIST_PAGE_LIMIT,
}: {
  registryId: string | null;
  authMethodId?: string | null;
  enabled?: boolean;
  limit?: number;
}) {
  const [sessions, setSessions] = useState<NativeAgentSessionItem[]>([]);
  const [meta, setMeta] = useState<AcpSessionListMeta | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSessions([]);
    setMeta(null);
    setCursor(null);
    setUnsupportedReason(null);
  }, []);

  const loadSessions = useCallback(
    async (nextCursor?: string | null) => {
      if (!registryId) {
        reset();
        return;
      }

      const append = Boolean(nextCursor);
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setUnsupportedReason(null);

      try {
        const response = await agentApi.listSessions({
          registry_id: registryId,
          limit,
          cursor: nextCursor ?? undefined,
          auth_method_id: authMethodId,
        });
        setMeta({
          registry_id: response.registry_id,
          agent_info: response.agent_info,
          capabilities: response.capabilities,
          next_cursor: response.next_cursor,
          truncated: response.truncated,
          unsupported_reason: response.unsupported_reason,
        });
        setSessions((prev) => (append ? [...prev, ...response.items] : response.items));
        setCursor(response.next_cursor);
        setUnsupportedReason(response.unsupported_reason);
      } catch (error) {
        if (!append) {
          setSessions([]);
          setMeta(null);
          setCursor(null);
        }
        setUnsupportedReason(getListUnsupportedReason(error));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [authMethodId, limit, registryId, reset],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadSessions();
  }, [enabled, loadSessions]);

  useEffect(() => {
    if (registryId) return;
    reset();
  }, [registryId, reset]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    await loadSessions(cursor);
  }, [cursor, isLoadingMore, loadSessions]);

  return {
    sessions,
    setSessions: setSessions as Dispatch<SetStateAction<NativeAgentSessionItem[]>>,
    meta,
    cursor,
    hasMore: Boolean(cursor),
    isLoading,
    isLoadingMore,
    unsupportedReason,
    resumeUnsupportedReason: getResumeUnsupportedReason(meta?.capabilities),
    isTruncated: meta?.truncated ?? false,
    loadSessions,
    loadMore,
    reset,
  };
}
