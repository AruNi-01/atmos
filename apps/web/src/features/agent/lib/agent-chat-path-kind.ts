import { normalizeFsPath } from "@/features/agent/lib/tool-results/parse-tool-result";
import { collectCachedFileTrees } from "@/features/files/lib/file-tree-cache";
import { findPathInFileTrees } from "@/features/files/lib/file-tree-lookup";

export type AgentChatPathKind = "file" | "directory";

export async function resolveAgentChatPathKind(
  path: string,
): Promise<AgentChatPathKind | null> {
  const normalized = normalizeFsPath(path);
  if (!normalized) return null;
  const found = findPathInFileTrees(normalized, collectCachedFileTrees());
  if (!found) return null;
  return found.isDir ? "directory" : "file";
}
