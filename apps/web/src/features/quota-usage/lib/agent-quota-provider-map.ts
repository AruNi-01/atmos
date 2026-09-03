/**
 * Maps built-in terminal agent ids → AI Quota Usage provider ids.
 *
 * Only agents that have a corresponding `crates/quota-usage` provider appear here.
 * Agents without a row simply do not toggle any usage provider on save.
 *
 * Keep provider ids / labels in sync with `provider_specs()` in
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
  "deepseek-harness": ["deepseek"],
  antigravity: ["antigravity"],
  kimi: ["kimi"],
  amp: ["amp"],
  // commandcode usage provider is currently disabled in quota-usage
};

/** Known usage providers that are not tied to a terminal agent (opt-in only). */
export const AGENT_UNLINKED_QUOTA_PROVIDER_IDS = [
  "zai",
  "minimax",
  "mimo",
  "zed",
] as const;

/**
 * Full provider list for first-run Quota Usage onboarding (order matches backend specs).
 * Labels are product names and stay in English across locales.
 */
export const QUOTA_USAGE_ONBOARDING_PROVIDERS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode" },
  { id: "factory", label: "Factory Droid" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok Build" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "antigravity", label: "Antigravity" },
  { id: "zai", label: "Zhipu AI" },
  { id: "minimax", label: "MiniMax" },
  { id: "mimo", label: "Xiaomi MiMo" },
  { id: "kimi", label: "Kimi" },
  { id: "amp", label: "Amp" },
  { id: "zed", label: "Zed" },
] as const;

export type QuotaUsageOnboardingProviderId =
  (typeof QUOTA_USAGE_ONBOARDING_PROVIDERS)[number]["id"];

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
