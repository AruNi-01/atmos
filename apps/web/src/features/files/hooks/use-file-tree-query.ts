"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { forceRefetchActiveQueries } from "@/api/query/force-refetch";
import {
  fileTreeQueryOptions,
  listDirQueryOptions,
  readFileQueryOptions,
  searchContentQueryOptions,
  searchDirsQueryOptions,
} from "@/features/files/lib/files-query-options";
import { useSessionListQuery } from "@/features/workspace/hooks/use-session-list-query";
import { sessionListKeys } from "@/features/workspace/store/session-list-snapshot-store";

/**
 * Primary hook for the project file tree.
 * Session snapshot keeps the tree across long idle workspace hops.
 */
export function useFileTreeQuery(rootPath: string | null, showHidden: boolean) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const key = rootPath ? sessionListKeys.fileTree(rootPath, showHidden) : null;
  return useSessionListQuery(
    key,
    fileTreeQueryOptions(scope, connectionState, rootPath ?? "", showHidden, {
      enabled: Boolean(rootPath),
    }),
  );
}

/** Per-directory listing, used by FileBrowser and dir-picker overlays. */
export function useListDirQuery(
  dirPath: string | null,
  options?: { dirsOnly?: boolean; showHidden?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery(
    listDirQueryOptions(scope, connectionState, dirPath ?? "", {
      ...options,
      enabled: Boolean(dirPath),
    }),
  );
}

/** File content query — for read/reload only; active editing buffer stays in useEditorStore. */
export function useReadFileQuery(path: string | null) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery(
    readFileQueryOptions(scope, connectionState, path ?? "", {
      enabled: Boolean(path),
    }),
  );
}

/** Ripgrep content search. Query is disabled when query string is empty. */
export function useSearchContentQuery(
  rootPath: string | null,
  query: string,
  options?: { maxResults?: number; caseSensitive?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery(
    searchContentQueryOptions(scope, connectionState, rootPath ?? "", query, {
      ...options,
      enabled: Boolean(rootPath) && query.trim().length > 0,
    }),
  );
}

/** Directory name search. */
export function useSearchDirsQuery(
  rootPath: string | null,
  query: string,
  options?: { maxResults?: number; maxDepth?: number },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery(
    searchDirsQueryOptions(scope, connectionState, rootPath ?? "", query, {
      ...options,
      enabled: Boolean(rootPath),
    }),
  );
}

/**
 * User Refresh / post-mutation: force re-hit the server for this file tree.
 * Navigating into Files still paints from Query + session-list cache.
 */
export async function invalidateFileTree(rootPath: string, showHidden: boolean): Promise<void> {
  const client = getAtmosWebQueryClient();
  const scope = getComputerQueryScope();
  await forceRefetchActiveQueries(
    queryKeys.computer.fileTree(scope, rootPath, showHidden),
    client,
  );
}

/**
 * Invalidate all file queries under a given rootPath (tree + search results).
 * Useful after mutations that may affect multiple sub-keys.
 */
export async function invalidateFilesForRoot(rootPath: string): Promise<void> {
  const client = getAtmosWebQueryClient();
  const scope = getComputerQueryScope();
  await client.invalidateQueries({
    queryKey: queryKeys.computer.files(scope, rootPath),
  });
}
