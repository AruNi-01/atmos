import { canonicalizeChatProviderId } from "@/features/agent/lib/custom-agent-registry";

const MODEL_CONFIG_KEYS = ["model", "models"] as const;
const THINKING_CONFIG_KEYS = [
  "thinking",
  "think",
  "thought_level",
  "effort",
  "reasoning_effort",
  "reasoning-effort",
] as const;
const MODE_CONFIG_KEYS = ["mode"] as const;
const PERMISSION_CONFIG_KEYS = ["permission_mode", "permissionMode"] as const;
const FAST_CONFIG_KEYS = ["fast"] as const;

export type PreferredNewChatConfig = {
  modelId: string;
  thinkingId: string;
  modeId: string;
  permissionModeId: string;
  fastId: string;
};

export function pickAgentDefaultConfigValue(
  defaultConfig: Record<string, string> | null | undefined,
  keys: readonly string[],
): string {
  if (!defaultConfig) return "";
  for (const key of keys) {
    const value = defaultConfig[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** Restore the full last New Chat snapshot (or legacy default_config model/thinking). */
export function preferredConfigFromDefault(
  defaultConfig: Record<string, string> | null | undefined,
): PreferredNewChatConfig {
  return {
    modelId: pickAgentDefaultConfigValue(defaultConfig, MODEL_CONFIG_KEYS),
    thinkingId: pickAgentDefaultConfigValue(defaultConfig, THINKING_CONFIG_KEYS),
    modeId: pickAgentDefaultConfigValue(defaultConfig, MODE_CONFIG_KEYS),
    permissionModeId: pickAgentDefaultConfigValue(defaultConfig, PERMISSION_CONFIG_KEYS),
    fastId: pickAgentDefaultConfigValue(defaultConfig, FAST_CONFIG_KEYS),
  };
}

export function pickInstalledRegistryId(
  installedIds: string[],
  preferred: string | null | undefined,
): string {
  const next = preferred?.trim() ?? "";
  if (!next) return "";
  if (installedIds.length === 0) return next;
  if (installedIds.includes(next)) return next;
  const folded = canonicalizeChatProviderId(next);
  return installedIds.find((id) => canonicalizeChatProviderId(id) === folded) ?? "";
}

export function lastNewChatConfigForAgent(
  configs: Record<string, Record<string, string>> | null | undefined,
  agentId: string | null | undefined,
): Record<string, string> | undefined {
  const id = agentId?.trim() ?? "";
  if (!id || !configs) return undefined;
  if (configs[id]) return configs[id];
  const folded = canonicalizeChatProviderId(id);
  const match = Object.entries(configs).find(
    ([key]) => canonicalizeChatProviderId(key) === folded,
  );
  return match?.[1];
}

/** Local landing snapshots win; disk fills agents the client has not remembered yet. */
export function mergeLastNewChatConfigs(
  local: Record<string, Record<string, string>> | null | undefined,
  incoming: Record<string, Record<string, string>> | null | undefined,
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = { ...(incoming ?? {}) };
  for (const [agentId, config] of Object.entries(local ?? {})) {
    if (Object.keys(config).length > 0) merged[agentId] = config;
  }
  return merged;
}
