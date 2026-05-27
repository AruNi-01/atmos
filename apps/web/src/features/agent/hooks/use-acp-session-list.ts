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
const ACP_SESSION_LIST_BATCH_TARGET = 20;
const MAX_SESSION_LIST_PAGES_PER_BATCH = 5;

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
  batchTarget = ACP_SESSION_LIST_BATCH_TARGET,
}: {
  registryId: string | null;
  cwd?: string | null;
  cwds?: string[] | null;
  authMethodId?: string | null;
  enabled?: boolean;
  limit?: number;
  batchTarget?: number;
}) {
  const [sessions, setSessions] = useState<NativeAgentSessionItem[]>([]);
  const [meta, setMeta] = useState<AcpSessionListMeta | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const rootItemsRef = useRef<Record<string, NativeAgentSessionItem[]>>({});
  const rootMetaRef = useRef<Record<string, AcpSessionListMeta>>({});
  const rootCursorsRef = useRef<Record<string, string | null>>({});
  const activeRootKeysRef = useRef<Set<string>>(new Set());
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
    rootItemsRef.current = {};
    rootMetaRef.current = {};
    rootCursorsRef.current = {};
    activeRootKeysRef.current = new Set();
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

  const recomputeFromRootCache = useCallback(() => {
    const activeKeys = activeRootKeysRef.current;
    const activeMetas = Object.entries(rootMetaRef.current)
      .filter(([key]) => activeKeys.has(key))
      .map(([, value]) => value);
    const nextCursor = Array.from(activeKeys)
      .map((key) => rootCursorsRef.current[key])
      .find(Boolean) ?? null;

    setSessions(mergeSessions(Array.from(activeKeys).flatMap((key) => rootItemsRef.current[key] ?? [])));
    setCursor(nextCursor);

    const firstMeta = activeMetas[0];
    if (!firstMeta) {
      setMeta(null);
      setUnsupportedReason(null);
      return;
    }

    const nextUnsupportedReason =
      activeMetas.find((item) => item.unsupported_reason)?.unsupported_reason ?? null;
    setMeta({
      ...firstMeta,
      next_cursor: nextCursor,
      truncated: activeMetas.some((item) => item.truncated),
      unsupported_reason: nextUnsupportedReason,
    });
    setUnsupportedReason(nextUnsupportedReason);
  }, [mergeSessions]);

  const loadRootPages = useCallback(
    async ({
      append,
      requestSeq,
      rootsToLoad,
    }: {
      append: boolean;
      requestSeq: number;
      rootsToLoad: (string | null)[];
    }) => {
      if (!registryId || rootsToLoad.length === 0) return;

      const isLatestRequest = () => requestSeq === requestSeqRef.current;
      const responses = await Promise.all(
        rootsToLoad.map(async (root) => {
          const rootKey = sessionListRootKey(root);
          const items: NativeAgentSessionItem[] = [];
          let cursor = append ? rootCursorsRef.current[rootKey] ?? undefined : undefined;
          let response: ListAgentSessionsResponse | null = null;
          let nextCursor: string | null = null;
          let truncated = false;
          let pageCount = 0;
          const seenCursors = new Set<string>();
          if (cursor) seenCursors.add(cursor);

          while (pageCount < MAX_SESSION_LIST_PAGES_PER_BATCH) {
            const page = await agentApi.listSessions({
              registry_id: registryId,
              cwd: root,
              limit,
              cursor,
              auth_method_id: authMethodId,
            });
            pageCount += 1;
            response = page;
            items.push(...page.items);
            truncated = truncated || page.truncated;
            nextCursor = page.next_cursor;

            if (!nextCursor || items.length >= batchTarget || seenCursors.has(nextCursor)) {
              if (nextCursor && seenCursors.has(nextCursor)) {
                nextCursor = null;
              }
              break;
            }

            seenCursors.add(nextCursor);
            cursor = nextCursor;
          }

          if (!response) {
            throw new Error("Failed to load ACP sessions.");
          }

          response = {
            ...response,
            items,
            next_cursor: nextCursor,
            truncated,
          };
          return { rootKey, response };
        }),
      );
      if (!isLatestRequest()) return;

      for (const { rootKey, response } of responses) {
        rootItemsRef.current[rootKey] = append
          ? mergeSessions([...(rootItemsRef.current[rootKey] ?? []), ...response.items])
          : response.items;
        rootMetaRef.current[rootKey] = {
          registry_id: response.registry_id,
          agent_info: response.agent_info,
          capabilities: response.capabilities,
          next_cursor: response.next_cursor,
          truncated: response.truncated,
          unsupported_reason: response.unsupported_reason,
        };
        rootCursorsRef.current[rootKey] = response.next_cursor;
        activeRootKeysRef.current.add(rootKey);
      }

      recomputeFromRootCache();
    },
    [authMethodId, batchTarget, limit, mergeSessions, recomputeFromRootCache, registryId],
  );

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
        if (!append) {
          const nextRootKeys = new Set(rootsToLoad.map(sessionListRootKey));
          rootItemsRef.current = {};
          rootMetaRef.current = {};
          rootCursorsRef.current = {};
          activeRootKeysRef.current = nextRootKeys;
        }

        await loadRootPages({ append, requestSeq, rootsToLoad });
      } catch (error) {
        if (!isLatestRequest()) return;
        if (!append) {
          rootItemsRef.current = {};
          rootMetaRef.current = {};
          rootCursorsRef.current = {};
          activeRootKeysRef.current = new Set();
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
    [loadRootPages, registryId, reset, roots],
  );

  useEffect(() => {
    reset();
  }, [authMethodId, limit, registryId, reset]);

  useEffect(() => {
    if (!enabled || !registryId) {
      reset();
      return;
    }

    const nextRootKeys = new Set(roots.map(sessionListRootKey));
    const currentRootKeys = activeRootKeysRef.current;
    const addedRoots = roots.filter((root) => !currentRootKeys.has(sessionListRootKey(root)));
    const removedRootKeys = Array.from(currentRootKeys).filter((key) => !nextRootKeys.has(key));

    if (addedRoots.length === 0 && removedRootKeys.length === 0) return;

    const requestSeq = (requestSeqRef.current += 1);
    for (const key of removedRootKeys) {
      delete rootItemsRef.current[key];
      delete rootMetaRef.current[key];
      delete rootCursorsRef.current[key];
    }
    activeRootKeysRef.current = nextRootKeys;
    if (removedRootKeys.length > 0) {
      recomputeFromRootCache();
    }

    if (addedRoots.length === 0) {
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    setIsLoading(true);
    setIsLoadingMore(false);
    setUnsupportedReason(null);
    void (async () => {
      const isLatestRequest = () => requestSeq === requestSeqRef.current;
      try {
        await loadRootPages({ append: false, requestSeq, rootsToLoad: addedRoots });
      } catch (error) {
        if (!isLatestRequest()) return;
        for (const root of addedRoots) {
          activeRootKeysRef.current.delete(sessionListRootKey(root));
        }
        recomputeFromRootCache();
        setUnsupportedReason(getListFailureReason(error));
      } finally {
        if (isLatestRequest()) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    })();
  }, [enabled, loadRootPages, recomputeFromRootCache, registryId, reset, roots]);

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
