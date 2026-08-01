/**
 * Maps built-in terminal agent ids → AI Quota Usage provider ids.
 *
 * Only agents that have a corresponding `crates/quota-usage` provider appear here.
 * Agents without a row simply do not toggle any usage provider on save.
 *
 * Keep provider ids in sync with `provider_specs()` in
 * `crates/quota-usage/src/runtime.rs`.
 */
export const AGENT_TO_QUOTA_PROVIDER_IDS: Readonly<Record<string, readonly string[]>> = {
  claude: ["claude"],
  codex: ["codex"],
  cursor: ["cursor"],
  opencode: ["opencode"],
  /** Factory Droid CLI → Factory usage provider */
  droid: ["factory"],
  gemini: ["gemini"],
  "grok-build": ["grok"],
  antigravity: ["antigravity"],
  kimi: ["kimi"],
  amp: ["amp"],
  // commandcode usage provider is currently disabled in quota-usage
};

/** Known usage providers that are not tied to a terminal agent (stay off on agent onboarding). */
export const AGENT_UNLINKED_QUOTA_PROVIDER_IDS = [
  "zai",
  "minimax",
  "mimo",
  "zed",
] as const;

/**
 * Resolve which usage provider ids should be enabled for the selected agents.
 */
export function usageProviderIdsForAgents(
  agentIds: Iterable<string>,
): Set<string> {
  const providers = new Set<string>();
  for (const agentId of agentIds) {
    const mapped = AGENT_TO_QUOTA_PROVIDER_IDS[agentId];
    if (!mapped) continue;
    for (const providerId of mapped) {
      providers.add(providerId);
    }
  }
  return providers;
}
