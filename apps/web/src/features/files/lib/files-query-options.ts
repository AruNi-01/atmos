"use client";

import { fsApi } from "@/api/ws-api";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { waitForConnection } from "@/features/project/store/project-store-connection";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

async function withConnection<T>(fn: () => Promise<T>): Promise<T> {
  await waitForConnection();
  return fn();
}

export function fileTreeQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  rootPath: string,
  showHidden: boolean,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.fileTree(scope, rootPath, showHidden),
    queryFn: () => withConnection(() => fsApi.listProjectFiles(rootPath, { showHidden })),
    staleTime: 30_000,
  });
}

export function listDirQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  dirPath: string,
  options?: { dirsOnly?: boolean; showHidden?: boolean },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.listDir(scope, dirPath, options),
    queryFn: () =>
      withConnection(() =>
        fsApi.listDir(dirPath, {
          dirsOnly: options?.dirsOnly ?? true,
          showHidden: options?.showHidden ?? false,
        }),
      ),
    staleTime: 30_000,
  });
}

export function readFileQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  path: string,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.readFile(scope, path),
    queryFn: () => withConnection(() => fsApi.readFile(path)),
    staleTime: 10_000,
  });
}

export function searchContentQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  rootPath: string,
  query: string,
  options?: { maxResults?: number; caseSensitive?: boolean },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    enabled: query.trim().length > 0,
    queryKey: queryKeys.computer.searchContent(scope, rootPath, query, options),
    queryFn: () => withConnection(() => fsApi.searchContent(rootPath, query, options)),
    staleTime: 15_000,
  });
}

export function searchDirsQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  rootPath: string,
  query: string,
  options?: { maxResults?: number; maxDepth?: number },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.searchDirs(scope, rootPath, query, options),
    queryFn: () => withConnection(() => fsApi.searchDirs(rootPath, query, options)),
    staleTime: 15_000,
  });
}
