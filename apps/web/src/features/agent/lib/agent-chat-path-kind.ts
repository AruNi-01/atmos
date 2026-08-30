import { fsApi } from "@/api/ws-api";
import { agentChatPathLooksLikeDirectory } from "@/features/agent/lib/agent-chat-file-links";
import { normalizeFsPath } from "@/features/agent/lib/tool-results/parse-tool-result";
import { collectCachedFileTrees } from "@/features/files/lib/file-tree-cache";
import { lookupPathInFileTrees } from "@/features/files/lib/file-tree-lookup";

export type AgentChatPathKind = "file" | "directory";

const kindCache = new Map<string, AgentChatPathKind>();
const inflight = new Map<string, Promise<AgentChatPathKind | null>>();

async function tryFileKind(path: string): Promise<AgentChatPathKind | null> {
  try {
    const result = await fsApi.readFile(path);
    if (result.exists) return "file";
  } catch {
    // Directories fail readFile.
  }
  return null;
}

async function tryDirectoryKind(path: string): Promise<AgentChatPathKind | null> {
  try {
    await fsApi.listDir(path, { showHidden: true, dirsOnly: true });
    return "directory";
  } catch {
    return null;
  }
}

async function statAgentChatPathKind(path: string): Promise<AgentChatPathKind | null> {
  if (agentChatPathLooksLikeDirectory(path)) {
    return (await tryDirectoryKind(path)) ?? (await tryFileKind(path));
  }
  return (await tryFileKind(path)) ?? (await tryDirectoryKind(path));
}

export async function resolveAgentChatPathKind(
  path: string,
): Promise<AgentChatPathKind | null> {
  const normalized = normalizeFsPath(path);
  if (!normalized) return null;

  const fromTree = lookupPathInFileTrees(normalized, collectCachedFileTrees());
  if (fromTree === "file" || fromTree === "directory") return fromTree;
  if (fromTree === "absent") return null;

  const cached = kindCache.get(normalized);
  if (cached) return cached;

  const pending = inflight.get(normalized);
  if (pending) return pending;

  const request = statAgentChatPathKind(normalized)
    .then((kind) => {
      if (kind) kindCache.set(normalized, kind);
      return kind;
    })
    .finally(() => {
      inflight.delete(normalized);
    });
  inflight.set(normalized, request);
  return request;
}
