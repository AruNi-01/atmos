"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hostSessionApi,
  type HostSessionListItem,
  type HostSessionSearchHit,
  type HostSessionSearchStatus,
} from "@/api/ws/host-session-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { isCancelledError } from "@/shared/lib/is-cancelled-error";
import {
  EMPTY_HOST_SESSION_FILTERS,
  hostSessionDateBounds,
  hostSessionProjectLabel,
  type HostSessionFilters,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  DEFAULT_HOST_SESSION_SORT,
  type HostSessionSort,
} from "@/features/agent-sessions/lib/host-session-groups";

export const HOST_SESSION_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export type HostSessionListParams = {
  query?: string;
  filters?: HostSessionFilters;
  sort?: HostSessionSort;
};

function mergeSessions(
  current: HostSessionListItem[],
  incoming: HostSessionListItem[],
  replace: boolean,
): HostSessionListItem[] {
  if (replace) return incoming;
  const seen = new Set(current.map((session) => session.key));
  const next = [...current];
  for (const session of incoming) {
    if (seen.has(session.key)) continue;
    seen.add(session.key);
    next.push(session);
  }
  return next;
}

function mergeHits(
  current: HostSessionSearchHit[],
  incoming: HostSessionSearchHit[],
  replace: boolean,
): HostSessionSearchHit[] {
  if (replace) return incoming;
  const map = new Map(current.map((hit) => [hit.root_session_key, hit]));
  for (const hit of incoming) {
    map.set(hit.root_session_key, hit);
  }
  return [...map.values()];
}

export function useHostSessionList({
  query = "",
  filters,
  sort = DEFAULT_HOST_SESSION_SORT,
}: HostSessionListParams = {}): {
  sessions: HostSessionListItem[];
  hits: HostSessionSearchHit[];
  searchStatus: HostSessionSearchStatus | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  isSyncing: boolean;
  hasMore: boolean;
  total: number;
  facetProviders: string[];
  facetProjects: string[];
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
} {
  const connected = useWebSocketStore((state) => state.connectionState === "connected");
  const providerId = filters?.providerId ?? null;
  const project = filters?.project ?? null;
  const { updatedAfter, updatedBefore } = hostSessionDateBounds(filters ?? EMPTY_HOST_SESSION_FILTERS);
  const [sessions, setSessions] = useState<HostSessionListItem[]>([]);
  const [hits, setHits] = useState<HostSessionSearchHit[]>([]);
  const [searchStatus, setSearchStatus] = useState<HostSessionSearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [facetProviders, setFacetProviders] = useState<string[]>([]);
  const [facetProjects, setFacetProjects] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const pendingSync = useRef(false);
  const hasSessions = useRef(false);
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const sessionsRef = useRef<HostSessionListItem[]>([]);
  const totalRef = useRef(0);
  const providerSetRef = useRef(new Set<string>());
  const projectSetRef = useRef(new Set<string>());

  sessionsRef.current = sessions;
  totalRef.current = total;

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(() => {
    pendingSync.current = true;
    setReloadToken((token) => token + 1);
  }, []);

  const mergeFacets = useCallback(
    (rows: readonly HostSessionListItem[], reset: boolean) => {
      if (reset) {
        providerSetRef.current = new Set();
        projectSetRef.current = new Set();
      }
      let changed = reset;
      for (const row of rows) {
        if (!providerSetRef.current.has(row.provider_id)) {
          providerSetRef.current.add(row.provider_id);
          changed = true;
        }
        const label = hostSessionProjectLabel(row);
        if (label && !projectSetRef.current.has(label)) {
          projectSetRef.current.add(label);
          changed = true;
        }
      }
      if (!changed) return;
      setFacetProviders([...providerSetRef.current].sort((a, b) => a.localeCompare(b)));
      setFacetProjects([...projectSetRef.current].sort((a, b) => a.localeCompare(b)));
    },
    [],
  );

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    const generation = ++generationRef.current;
    loadingMoreRef.current = false;
    const sync = pendingSync.current;
    pendingSync.current = false;
    if (!hasSessions.current) {
      setIsLoading(true);
    }
    if (sync) {
      setIsSyncing(true);
    }
    const needle = debouncedQuery.trim();
    void hostSessionApi
      .list({
        query: needle || null,
        provider_id: providerId,
        project,
        sort_field: sort.field,
        sort_order: sort.order,
        updated_after: updatedAfter,
        updated_before: updatedBefore,
        limit: HOST_SESSION_PAGE_SIZE,
        offset: 0,
        sync,
      })
      .then((response) => {
        if (cancelled || generationRef.current !== generation) return;
        const nextSessions = response.sessions;
        const nextHits = response.hits ?? [];
        setSessions(nextSessions);
        setHits(nextHits);
        setSearchStatus(response.search_status ?? null);
        setTotal(response.total);
        mergeFacets(nextSessions, !providerId && !project && !updatedAfter && !updatedBefore);
        hasSessions.current = true;
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || isCancelledError(err) || generationRef.current !== generation) return;
        setError(err instanceof Error ? err.message : "error");
      })
      .finally(() => {
        if (cancelled || generationRef.current !== generation) return;
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    connected,
    debouncedQuery,
    mergeFacets,
    project,
    providerId,
    reloadToken,
    sort.field,
    sort.order,
    updatedAfter,
    updatedBefore,
  ]);

  const loadMore = useCallback(() => {
    if (!connected || loadingMoreRef.current) return;
    const loaded = sessionsRef.current.length;
    if (loaded >= totalRef.current) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const needle = debouncedQuery.trim();
    void hostSessionApi
      .list({
        query: needle || null,
        provider_id: providerId,
        project,
        sort_field: sort.field,
        sort_order: sort.order,
        updated_after: updatedAfter,
        updated_before: updatedBefore,
        limit: HOST_SESSION_PAGE_SIZE,
        offset: loaded,
        sync: false,
      })
      .then((response) => {
        if (generationRef.current !== generation) return;
        if (response.sessions.length === 0) {
          setTotal(loaded);
          return;
        }
        const nextSessions = mergeSessions(sessionsRef.current, response.sessions, false);
        if (nextSessions.length === loaded) {
          setTotal(loaded);
          return;
        }
        setSessions(nextSessions);
        setHits((current) => mergeHits(current, response.hits ?? [], false));
        setSearchStatus(response.search_status ?? null);
        setTotal(response.total);
        mergeFacets(response.sessions, false);
        hasSessions.current = true;
        setError(null);
      })
      .catch((err: unknown) => {
        if (isCancelledError(err) || generationRef.current !== generation) return;
        setError(err instanceof Error ? err.message : "error");
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [connected, debouncedQuery, mergeFacets, project, providerId, sort.field, sort.order, updatedAfter, updatedBefore]);

  useEffect(() => {
    if (!connected) return;
    return useWebSocketStore.getState().onEvent("host_session_index_updated", () => {
      setReloadToken((token) => token + 1);
    });
  }, [connected]);

  return {
    sessions,
    hits,
    searchStatus,
    isLoading,
    isLoadingMore,
    isSyncing,
    hasMore: sessions.length < total,
    total,
    facetProviders,
    facetProjects,
    error,
    refresh,
    loadMore,
  };
}
