import type { CustomAgent, NativeChatAgent, RegistryAgent } from "@/api/ws/agent-api";
import { getAgentIconCandidates } from "@/features/agent/lib/agent-icon-candidates";
import {
  parseAuthRequiredError,
  type AgentAuthRequiredPayload,
} from "@/features/agent/lib/agent-runtime-socket";

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

/** Picker host fold: hide ACP rows when the matching Native tab is on.
 * Spawn routing does not fold these ids — `codex-acp` stays ACP. */
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

export function mergeInstalledAgents(
  registryInstalled: RegistryAgent[],
  customAgents: CustomAgent[],
  nativeAgents: NativeChatAgent[] = [],
): RegistryAgent[] {
  const enabledNatives = nativeAgents.filter((agent) => agent.enabled);
  const nativeIds = new Set(enabledNatives.map((agent) => agent.id));
  const seen = new Set<string>();
  const merged: RegistryAgent[] = [];

  for (const agent of enabledNatives) {
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    merged.push(nativeChatAgentToRegistry(agent));
  }

  for (const agent of registryInstalled) {
    if (nativeIds.has(canonicalizeChatProviderId(agent.id))) continue;
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
  return upper.includes("KEY") || upper.includes("TOKEN") || upper.includes("SECRET");
}
