const MODEL_CONFIG_KEYS = ["model", "models"] as const;
const THINKING_CONFIG_KEYS = ["thinking", "think", "thought_level"] as const;

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

export function preferredConfigFromDefault(
  defaultConfig: Record<string, string> | null | undefined,
): { modelId: string; thinkingId: string } {
  return {
    modelId: pickAgentDefaultConfigValue(defaultConfig, MODEL_CONFIG_KEYS),
    thinkingId: pickAgentDefaultConfigValue(defaultConfig, THINKING_CONFIG_KEYS),
  };
}

export function pickInstalledRegistryId(
  installedIds: string[],
  preferred: string | null | undefined,
): string {
  const next = preferred?.trim() ?? "";
  if (!next) return "";
  if (installedIds.length === 0) return next;
  return installedIds.includes(next) ? next : "";
}
