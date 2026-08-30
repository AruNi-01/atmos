import type { FileTreeNode, FsListProjectFilesResponse } from "@/api/ws-api";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { useSessionListSnapshotStore } from "@/features/workspace/store/session-list-snapshot-store";
import type { CachedFileTree } from "./file-tree-lookup";

function asFileTreeResponse(data: unknown): FsListProjectFilesResponse | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { root_path?: unknown; tree?: unknown };
  if (typeof record.root_path !== "string" || !Array.isArray(record.tree)) return null;
  return record as FsListProjectFilesResponse;
}

function isFileTreeQueryKey(key: readonly unknown[]): boolean {
  return key.at(-2) === "tree" && key.includes("files");
}

/**
 * Project/workspace trees already loaded for Files, Global Search, and
 * breadcrumbs. Does not fetch.
 */
export function collectCachedFileTrees(): CachedFileTree[] {
  const trees: CachedFileTree[] = [];
  const seen = new Set<FileTreeNode[]>();

  const push = (data: unknown) => {
    const response = asFileTreeResponse(data);
    if (!response || seen.has(response.tree)) return;
    seen.add(response.tree);
    trees.push({ rootPath: response.root_path, tree: response.tree });
  };

  for (const entry of Object.values(useSessionListSnapshotStore.getState().entries)) {
    push(entry.data);
  }

  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    for (const [key, data] of client.getQueriesData<FsListProjectFilesResponse>({
      predicate: (query) => {
        const queryKey = query.queryKey;
        if (!Array.isArray(queryKey) || !isFileTreeQueryKey(queryKey)) return false;
        return queryKey[2] === scope.activeInstanceId;
      },
    })) {
      void key;
      push(data);
    }
  } catch {
    // SSR / tests without a browser QueryClient.
  }

  return trees;
}
