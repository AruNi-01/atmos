"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agentApi,
  type AgentCapabilities,
  type ListAgentSessionsResponse,
  type NativeAgentSessionItem,
} from "@/api/rest-api";
import { parseAuthRequiredError } from "@/features/agent/lib/agent-runtime-socket";

export const ACP_SESSION_LIST_PAGE_LIMIT = 200;

export type AcpSessionListMeta = Omit<ListAgentSessionsResponse, "items">;

function sessionListRootKey(root: string | null): string {
  return root ?? "__all__";
}

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

export function getListFailureReason(error: unknown): string {
  if (parseAuthRequiredError(error)) {
    return "Authentication is required before this agent can list ACP sessions.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Failed to load ACP sessions.";
}

export function useAcpSessionList({
  registryId,
  cwd = null,
  cwds = null,
  authMethodId = null,
  enabled = true,
  limit = ACP_SESSION_LIST_PAGE_LIMIT,
}: {
  registryId: string | null;
  cwd?: string | null;
  cwds?: string[] | null;
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
  const requestSeqRef = useRef(0);
  const rootCursorsRef = useRef<Record<string, string | null>>({});
  const rootsKey = JSON.stringify(cwds && cwds.length > 0 ? cwds.filter(Boolean) : cwd ? [cwd] : []);

  const roots = useMemo<(string | null)[]>(() => {
    const roots = JSON.parse(rootsKey) as string[];
    if (roots.length > 0) {
      return Array.from(new Set(roots));
    }
    return cwd ? [cwd] : [null];
  }, [cwd, rootsKey]);

  const reset = useCallback(() => {
    requestSeqRef.current += 1;
    setSessions([]);
    setMeta(null);
    setCursor(null);
    setIsLoading(false);
    setIsLoadingMore(false);
    setUnsupportedReason(null);
    rootCursorsRef.current = {};
  }, []);

  const mergeSessions = useCallback((items: NativeAgentSessionItem[]) => {
    const byId = new Map<string, NativeAgentSessionItem>();
    for (const item of items) {
      byId.set(`${item.registry_id}:${item.acp_session_id}`, item);
    }

    return Array.from(byId.values()).sort((a, b) => {
      const left = a.updated_at ? Date.parse(a.updated_at) : 0;
      const right = b.updated_at ? Date.parse(b.updated_at) : 0;
      return right - left;
    });
  }, []);

  const loadSessions = useCallback(
    async (nextCursor?: string | null) => {
      if (!registryId) {
        reset();
        return;
      }

      const requestSeq = (requestSeqRef.current += 1);
      const isLatestRequest = () => requestSeq === requestSeqRef.current;
      const append = Boolean(nextCursor);
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setUnsupportedReason(null);

      try {
        const rootsToLoad = append
          ? roots.filter((root) => rootCursorsRef.current[sessionListRootKey(root)])
          : roots;

        if (append && rootsToLoad.length === 0) return;

        const responses = await Promise.all(
          rootsToLoad.map(async (root) => {
            const response = await agentApi.listSessions({
              registry_id: registryId,
              cwd: root,
              limit,
              cursor: append
                ? rootCursorsRef.current[sessionListRootKey(root)] ?? undefined
                : nextCursor ?? undefined,
              auth_method_id: authMethodId,
            });
            return { root, response };
          }),
        );
        if (!isLatestRequest()) return;

        const nextRootCursors = append ? { ...rootCursorsRef.current } : {};
        for (const { root, response } of responses) {
          nextRootCursors[sessionListRootKey(root)] = response.next_cursor;
        }
        rootCursorsRef.current = nextRootCursors;

        const firstResponse = responses[0]?.response;
        if (!firstResponse) return;
        setMeta({
          registry_id: firstResponse.registry_id,
          agent_info: firstResponse.agent_info,
          capabilities: firstResponse.capabilities,
          next_cursor: Object.values(nextRootCursors).find(Boolean) ?? null,
          truncated: responses.some(({ response }) => response.truncated),
          unsupported_reason: firstResponse.unsupported_reason,
        });
        setSessions((prev) =>
          mergeSessions([
            ...(append ? prev : []),
            ...responses.flatMap(({ response }) => response.items),
          ]),
        );
        setCursor(Object.values(nextRootCursors).find(Boolean) ?? null);
        setUnsupportedReason(firstResponse.unsupported_reason);
      } catch (error) {
        if (!isLatestRequest()) return;
        if (!append) {
          setSessions([]);
          setMeta(null);
          setCursor(null);
        }
        setUnsupportedReason(getListFailureReason(error));
      } finally {
        if (isLatestRequest()) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [authMethodId, limit, mergeSessions, registryId, reset, roots],
  );

  useEffect(() => {
    reset();
  }, [authMethodId, registryId, reset, rootsKey]);

  useEffect(() => {
    if (!enabled || !registryId) return;
    void loadSessions();
  }, [enabled, loadSessions, registryId]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    await loadSessions(cursor);
  }, [cursor, isLoadingMore, loadSessions]);

  return {
    sessions,
    setSessions,
    meta,
    cursor,
    hasMore: Boolean(cursor),
    isLoading,
    isLoadingMore,
    unsupportedReason,
    resumeUnsupportedReason: sessions.length > 0 && !unsupportedReason
      ? getResumeUnsupportedReason(meta?.capabilities)
      : null,
    isTruncated: meta?.truncated ?? false,
    loadSessions,
    loadMore,
    reset,
  };
}
