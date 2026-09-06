import type { AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";
import { queryKeys } from "@/api/query/query-keys";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import type {
  AgentRegistryListResponse,
  CustomAgentListResponse,
  NativeChatAgentListResponse,
} from "@/features/agent/lib/agent-registry-query-options";
import { mergeInstalledAgents } from "@/features/agent/lib/custom-agent-registry";
import type { RegistryAgent } from "@/api/ws/agent-api";
import {
  lastNewChatConfigForAgent,
  pickInstalledRegistryId,
  preferredConfigFromDefault,
  type PreferredNewChatConfig,
} from "@/features/agent/lib/agent-chat-prefs";
import {
  readAgentChatLastSessions,
  resolveRestoredAgentChat,
} from "@/features/agent/lib/agent-chat-last-session";
import { readDefaultAgentRegistryId } from "@/features/agent/lib/chat-helpers";

export const COMPOSER_LOCAL_CACHE_KEY = "atmos-agent-composer-cache";

export type ComposerLocalCache = {
  lastRegistryId: string;
  lastNewChatConfigs: Record<string, Record<string, string>>;
  optionsByAgent: Record<string, AgentOptionsSnapshot>;
};

export type ComposerChromeSeed = {
  providerId: string;
  preferred: PreferredNewChatConfig;
  catalog: AgentOptionsSnapshot | null;
  installedAgents: RegistryAgent[];
  lastNewChatConfigs: Record<string, Record<string, string>>;
  lastRegistryId: string;
  hydrated: boolean;
};

const EMPTY_CACHE: ComposerLocalCache = {
  lastRegistryId: "",
  lastNewChatConfigs: {},
  optionsByAgent: {},
};

let memory: ComposerLocalCache | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) next[key] = entry;
  }
  return next;
}

function parseConfigs(value: unknown): Record<string, Record<string, string>> {
  if (!isRecord(value)) return {};
  const next: Record<string, Record<string, string>> = {};
  for (const [agentId, config] of Object.entries(value)) {
    const parsed = parseStringMap(config);
    if (Object.keys(parsed).length > 0) next[agentId] = parsed;
  }
  return next;
}

export function composerOptionsAreUsable(
  snapshot: AgentOptionsSnapshot | null | undefined,
): snapshot is AgentOptionsSnapshot {
  if (!snapshot?.agent_id.trim()) return false;
  if (snapshot.status === "probing" && snapshot.models.length === 0 && snapshot.modes.length === 0) {
    return false;
  }
  return snapshot.models.length > 0 || snapshot.modes.length > 0;
}

function parseOptionsByAgent(value: unknown): Record<string, AgentOptionsSnapshot> {
  if (!isRecord(value)) return {};
  const next: Record<string, AgentOptionsSnapshot> = {};
  for (const [agentId, snapshot] of Object.entries(value)) {
    if (!isRecord(snapshot)) continue;
    const raw = snapshot as unknown as AgentOptionsSnapshot;
    const parsed: AgentOptionsSnapshot = {
      ...raw,
      agent_id: raw.agent_id?.trim() || agentId,
    };
    if (!composerOptionsAreUsable(parsed)) continue;
    if (parsed.agent_id !== agentId) continue;
    next[agentId] = parsed;
  }
  return next;
}

function parseCache(value: unknown): ComposerLocalCache {
  if (!isRecord(value)) return { ...EMPTY_CACHE };
  return {
    lastRegistryId:
      typeof value.lastRegistryId === "string" ? value.lastRegistryId.trim() : "",
    lastNewChatConfigs: parseConfigs(value.lastNewChatConfigs),
    optionsByAgent: parseOptionsByAgent(value.optionsByAgent),
  };
}

function persistMemory() {
  if (typeof window === "undefined" || !memory) return;
  try {
    window.localStorage.setItem(COMPOSER_LOCAL_CACHE_KEY, JSON.stringify(memory));
  } catch {
    // Quota / private mode — keep the in-memory copy for this session.
  }
}

export function readComposerLocalCache(): ComposerLocalCache {
  if (memory) return memory;
  if (typeof window === "undefined") {
    memory = { ...EMPTY_CACHE, lastNewChatConfigs: {}, optionsByAgent: {} };
    return memory;
  }
  try {
    const raw = window.localStorage.getItem(COMPOSER_LOCAL_CACHE_KEY);
    memory = raw ? parseCache(JSON.parse(raw) as unknown) : { ...EMPTY_CACHE };
  } catch {
    memory = { ...EMPTY_CACHE };
  }
  return memory;
}

function mutateCache(patch: Partial<ComposerLocalCache>) {
  const current = readComposerLocalCache();
  memory = {
    lastRegistryId: patch.lastRegistryId ?? current.lastRegistryId,
    lastNewChatConfigs: patch.lastNewChatConfigs ?? current.lastNewChatConfigs,
    optionsByAgent: patch.optionsByAgent ?? current.optionsByAgent,
  };
  persistMemory();
}

export function rememberLastRegistryId(registryId: string | null | undefined) {
  const next = registryId?.trim() ?? "";
  if (!next) return;
  mutateCache({ lastRegistryId: next });
}

export function rememberLastNewChatConfigs(
  configs: Record<string, Record<string, string>>,
) {
  mutateCache({ lastNewChatConfigs: parseConfigs(configs) });
}

export function rememberComposerOptions(snapshot: AgentOptionsSnapshot | null | undefined) {
  if (!composerOptionsAreUsable(snapshot)) return;
  const current = readComposerLocalCache();
  mutateCache({
    optionsByAgent: {
      ...current.optionsByAgent,
      [snapshot.agent_id]: snapshot,
    },
  });
}

export function readCachedInstalledAgents(): RegistryAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    const registry = client.getQueryData<AgentRegistryListResponse>(
      queryKeys.computer.agentRegistryList(scope),
    );
    const custom = client.getQueryData<CustomAgentListResponse>(
      queryKeys.computer.customAgentList(scope),
    );
    const natives = client.getQueryData<NativeChatAgentListResponse>(
      queryKeys.computer.nativeChatAgentList(scope),
    );
    if (!registry && !custom && !natives) return [];
    return mergeInstalledAgents(
      (registry?.agents ?? []).filter((agent) => agent.installed),
      custom?.agents ?? [],
      natives?.agents ?? [],
    );
  } catch {
    return [];
  }
}

export function seedNewChatComposer(input: {
  chatId: string;
  instanceKey?: string | null;
  isolatedModal: boolean;
  urlWorkspaceId: string | null;
  urlProjectId: string | null;
  chatMode: string;
  lastSessionPrefKey?: { workspaceId: string | null; projectId: string | null };
}): ComposerChromeSeed {
  const cache = readComposerLocalCache();
  const installedAgents = readCachedInstalledAgents();
  const installedIds = installedAgents.map((agent) => agent.id);
  const stored = readAgentChatLastSessions({
    workspaceId: input.isolatedModal ? null : input.urlWorkspaceId,
    projectId: input.isolatedModal ? null : input.urlProjectId,
    mode: input.chatMode,
    instanceKey: input.instanceKey,
    prefKey: input.lastSessionPrefKey,
  });
  const restored = resolveRestoredAgentChat({
    chatIdProp: input.chatId,
    instanceKey: input.instanceKey,
    instanceLast: stored.instanceLast,
    filterLast: stored.filterLast,
    installedAgentIds: installedIds,
    defaultRegistryId:
      cache.lastRegistryId ||
      readDefaultAgentRegistryId() ||
      installedAgents[0]?.id ||
      "",
  });
  const providerId =
    pickInstalledRegistryId(installedIds, restored.registryId) ||
    pickInstalledRegistryId(installedIds, cache.lastRegistryId) ||
    pickInstalledRegistryId(installedIds, readDefaultAgentRegistryId()) ||
    installedAgents[0]?.id ||
    restored.registryId ||
    cache.lastRegistryId ||
    "";
  const preferred = preferredConfigFromDefault(
    lastNewChatConfigForAgent(cache.lastNewChatConfigs, providerId)
      ?? installedAgents.find((agent) => agent.id === providerId)?.default_config,
  );
  const catalog = providerId
    ? cache.optionsByAgent[providerId] ?? null
    : null;
  return {
    providerId,
    preferred,
    catalog: composerOptionsAreUsable(catalog) ? catalog : null,
    installedAgents,
    lastNewChatConfigs: { ...cache.lastNewChatConfigs },
    lastRegistryId: cache.lastRegistryId || providerId,
    hydrated: !input.chatId.trim(),
  };
}

/** Test-only: drop the in-memory copy so the next read hits storage. */
/** Test-only: drop the in-memory copy so the next read hits storage. */
export function __resetComposerLocalCacheForTests() {
  memory = null;
}
