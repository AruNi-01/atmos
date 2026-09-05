import type { CustomAgent, NativeChatAgent, RegistryAgent } from "@/api/ws/agent-api";
import { getAgentIconCandidates } from "@/features/agent/lib/agent-icon-candidates";
import type { AgentAuthRequiredPayload } from "@/api/rest-api";
import { parseAuthRequiredError } from "@/features/agent/lib/agent-runtime-socket";

export const DEEPSEEK_HARNESS_ID = "deepseek-harness";
export const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";
/** Keep in sync with `crates/agent/src/manager/builtin_custom.rs`. */
export const DEEPSEEK_HARNESS_PACKAGE = "@deepseek-ai/dsh@0.1.2-alpha.5";
export const DEEPSEEK_HARNESS_ARGS = [
  "-y",
  DEEPSEEK_HARNESS_PACKAGE,
  "--profile",
  "acp",
] as const;
const TOKEN_METHOD_PREFIX = "token:";

export function customAgentDisplayName(agent: CustomAgent): string {
  return agent.display_name?.trim() || agent.name;
}

/** Built-ins default off; user-added customs default on. */
export function customAgentIsEnabled(agent: CustomAgent): boolean {
  if (agent.builtin) return agent.enabled === true;
  return agent.enabled !== false;
}

export function customAgentToRegistry(agent: CustomAgent): RegistryAgent {
  return {
    id: agent.name,
    name: customAgentDisplayName(agent),
    version: "",
    description: agent.description ?? "",
    repository: null,
    icon: agent.builtin ? (getAgentIconCandidates(agent.name)[0] ?? null) : null,
    cli_command: [agent.command, ...agent.args].filter(Boolean).join(" "),
    install_method: "custom",
    package: null,
    installed: true,
    default_config: agent.default_config,
    provision_kind: "adapter",
    can_remove: !agent.builtin,
  };
}

/**
 * Family kinship for Native ↔ ACP pairs (UI only).
 * Spawn routing does not fold ACP registry ids — `codex-acp` / `grok-build` stay ACP.
 */
export const NATIVE_CHAT_HOST_IDS = ["claude", "codex", "opencode", "pi", "grok"] as const;
export type NativeChatHostId = (typeof NATIVE_CHAT_HOST_IDS)[number];
export type ChatAgentKind = "native" | "acp";

export function canonicalizeChatProviderId(providerId: string): string {
  switch (providerId) {
    case "claude":
    case "claude-code":
    case "claude_code":
    case "claude-acp":
    case "claude-code-acp":
    case "claude-agent-acp":
      return "claude";
    case "codex":
    case "codex-acp":
      return "codex";
    case "opencode":
      return "opencode";
    case "pi":
    case "pi-acp":
      return "pi";
    case "grok":
    case "grok-build":
    case "grok-acp":
      return "grok";
    default:
      return providerId;
  }
}

export function isNativeChatHostId(id: string): id is NativeChatHostId {
  return (NATIVE_CHAT_HOST_IDS as readonly string[]).includes(id);
}

/** Shared product family for Native/ACP kinship (null when unpaired). */
export function chatAgentFamily(providerId: string): NativeChatHostId | null {
  const family = canonicalizeChatProviderId(providerId);
  return isNativeChatHostId(family) ? family : null;
}

/**
 * Map selected terminal (or kinship) ids to Native Chat host ids.
 * Onboarding enables these first, then ACP provision.
 */
export function nativeChatHostsForTerminalSelection(
  selectedIds: Iterable<string>,
): NativeChatHostId[] {
  const hosts = new Set<NativeChatHostId>();
  for (const id of selectedIds) {
    const family = chatAgentFamily(id);
    if (family) hosts.add(family);
  }
  return [...hosts];
}

/**
 * Transport kind for picker chips / enable hints.
 * Native Chat hosts use `install_method: "native_chat"`; ACP siblings share the family.
 */
export function chatAgentKind(agent: {
  id: string;
  install_method?: string | null;
}): ChatAgentKind | null {
  const family = chatAgentFamily(agent.id);
  if (!family) return null;
  if (agent.install_method === "native_chat") return "native";
  return "acp";
}

/** Families that currently list both a Native and an ACP option. */
export function contestedChatAgentFamilies(
  agents: Array<{ id: string; install_method?: string | null }>,
): Set<NativeChatHostId> {
  const kindsByFamily = new Map<NativeChatHostId, Set<ChatAgentKind>>();
  for (const agent of agents) {
    const family = chatAgentFamily(agent.id);
    const kind = chatAgentKind(agent);
    if (!family || !kind) continue;
    const kinds = kindsByFamily.get(family) ?? new Set<ChatAgentKind>();
    kinds.add(kind);
    kindsByFamily.set(family, kinds);
  }
  const contested = new Set<NativeChatHostId>();
  for (const [family, kinds] of kindsByFamily) {
    if (kinds.has("native") && kinds.has("acp")) contested.add(family);
  }
  return contested;
}

export function nativeChatAgentToRegistry(agent: NativeChatAgent): RegistryAgent {
  return {
    id: agent.id,
    name: agent.name,
    version: "",
    description: agent.description,
    repository: null,
    icon: getAgentIconCandidates(agent.id)[0] ?? null,
    cli_command: agent.executable,
    install_method: "native_chat",
    package: null,
    installed: true,
    provision_kind: "native",
    native_executable: agent.executable,
    can_remove: false,
  };
}

/** Agent Manager ACP tab: downloaded registry rows first, then the rest by name. */
export function sortAcpRegistryAgents<T extends { installed: boolean; name: string }>(
  agents: T[],
): T[] {
  return [...agents].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Lookup the Native Chat host that pairs with an ACP registry/custom id. */
export function nativeSiblingForAgent(
  providerId: string,
  nativeAgents: NativeChatAgent[],
): NativeChatAgent | null {
  const family = chatAgentFamily(providerId);
  if (!family) return null;
  return nativeAgents.find((agent) => agent.id === family) ?? null;
}

/**
 * Chat picker list: enabled Native hosts + installed ACP/custom.
 *
 * When both Native and ACP of the same family are available, keep both rows so
 * the composer can show Native/ACP chips. Same-id collisions (e.g. OpenCode
 * registry id matching the native host) still prefer the Native row.
 */
export function mergeInstalledAgents(
  registryInstalled: RegistryAgent[],
  customAgents: CustomAgent[],
  nativeAgents: NativeChatAgent[] = [],
): RegistryAgent[] {
  const enabledNatives = nativeAgents.filter((agent) => agent.enabled);
  const seen = new Set<string>();
  const merged: RegistryAgent[] = [];

  for (const agent of enabledNatives) {
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    merged.push(nativeChatAgentToRegistry(agent));
  }

  for (const agent of registryInstalled) {
    // Prefer the Native host when registry id collides (e.g. `opencode`).
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    merged.push(agent);
  }

  for (const agent of customAgents) {
    if (!customAgentIsEnabled(agent)) continue;
    if (seen.has(agent.name)) continue;
    seen.add(agent.name);
    merged.push(customAgentToRegistry(agent));
  }
  return merged;
}

export function isTokenAuthMethodId(methodId: string): boolean {
  return methodId.startsWith(TOKEN_METHOD_PREFIX);
}

export function tokenAuthEnvName(methodId: string): string | null {
  if (!isTokenAuthMethodId(methodId)) return null;
  const name = methodId.slice(TOKEN_METHOD_PREFIX.length).trim();
  return name || null;
}

export function authRequiredFromTurnError(
  error: string | null | undefined,
  providerId: string,
): AgentAuthRequiredPayload | null {
  const text = error?.trim() ?? "";
  if (!text) return null;
  const parsed = parseAuthRequiredError(text);
  if (parsed) return parsed;
  if (providerId !== DEEPSEEK_HARNESS_ID) return null;
  const lower = text.toLowerCase();
  if (
    !lower.includes("deepseek_api_key") &&
    !lower.includes("no api key for provider route")
  ) {
    return null;
  }
  return {
    request_id: "deepseek-api-key",
    methods: [
      {
        id: `${TOKEN_METHOD_PREFIX}${DEEPSEEK_API_KEY_ENV}`,
        name: "API token",
        description: "DEEPSEEK_API_KEY",
      },
    ],
    message: text,
  };
}

export function isSecretEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes("KEY") ||
    upper.includes("TOKEN") ||
    upper.includes("SECRET") ||
    upper.includes("PASSWORD") ||
    upper.includes("CREDENTIAL")
  );
}
