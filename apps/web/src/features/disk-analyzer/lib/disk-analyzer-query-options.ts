import type { QueryClient } from "@tanstack/react-query";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import {
  diskAnalyzerApi,
  type DiskTreeResponse,
} from "@/api/ws/disk-analyzer-api";

/** Match backend path-cache TTL (3 days). Client still revalidates via backend mtime. */
export const DISK_ANALYZER_STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function diskAnalyzerQueryKeyRoot(scope: ComputerQueryScope) {
  return [
    "disk-analyzer",
    scope.activeInstanceId,
    scope.connectionEpoch,
    scope.relaySessionRevision,
  ] as const;
}

export function diskAnalyzerLevelQueryKey(
  scope: ComputerQueryScope,
  scanId: string,
  path: string,
  topN: number,
) {
  return [...diskAnalyzerQueryKeyRoot(scope), "level", scanId, path, topN] as const;
}

export function diskAnalyzerLevelQueryOptions(
  scope: ComputerQueryScope,
  scanId: string,
  path: string,
  topN: number,
) {
  return {
    queryKey: diskAnalyzerLevelQueryKey(scope, scanId, path, topN),
    queryFn: async (): Promise<DiskTreeResponse> => {
      return diskAnalyzerApi.getTree(scanId, path, topN);
    },
    staleTime: DISK_ANALYZER_STALE_MS,
    gcTime: DISK_ANALYZER_STALE_MS,
  };
}

export function invalidateDiskAnalyzerQueries(client: QueryClient, scope: ComputerQueryScope) {
  return client.invalidateQueries({ queryKey: diskAnalyzerQueryKeyRoot(scope) });
}

export function removeDiskAnalyzerQueries(client: QueryClient, scope: ComputerQueryScope) {
  return client.removeQueries({ queryKey: diskAnalyzerQueryKeyRoot(scope) });
}
