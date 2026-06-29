import type React from "react";

import {
  type CodeAgentCustomEntry,
  type LlmFeatureBindings,
  type LlmProviderEntry,
  type LlmProviderKind,
  type LlmProvidersFile,
} from "@/api/ws-api";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { getWikiLanguageOptions } from "@/features/wiki/lib/wiki-languages";

export type ProviderDraft = {
  clientKey: string;
  persistedId: string;
  enabled: boolean;
  name: string;
  kind: LlmProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: string;
  max_output_tokens: string;
};

export type RoutingDraft = {
  features: LlmFeatureBindings;
};

export type LocalAgentOption = { id: string; label: string };

export type ModalDraftState = {
  version: number;
  providers: ProviderDraft[];
  routing: RoutingDraft;
};

export type SaveState = "idle" | "saving" | "saved";
export type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export const EMPTY_ROUTING: RoutingDraft = {
  features: {
    git_commit_language: null,
    workspace_issue_todo_language: null,
  },
};

export const AGENT_CLI_ROUTE_PREFIX = "agent-cli:";

export function agentCliRouteValue(agentId: string): string {
  return `${AGENT_CLI_ROUTE_PREFIX}${agentId.trim()}`;
}

export function parseAgentCliRouteValue(value?: string | null): string | null {
  const agentId = value?.startsWith(AGENT_CLI_ROUTE_PREFIX)
    ? value.slice(AGENT_CLI_ROUTE_PREFIX.length).trim()
    : "";
  return agentId || null;
}

export const BUILT_IN_LOCAL_AGENT_OPTIONS: readonly LocalAgentOption[] =
  TERMINAL_AGENT_DEFINITIONS.map((agent) => ({
    id: agent.id,
    label: agent.label,
  }));

const BUILT_IN_LOCAL_AGENT_IDS = new Set(
  BUILT_IN_LOCAL_AGENT_OPTIONS.map((agent) => agent.id),
);

export function buildLocalAgentOptions(
  configuredAgents: readonly CodeAgentCustomEntry[] = [],
): LocalAgentOption[] {
  const configuredById = new Map<string, CodeAgentCustomEntry>();
  for (const agent of configuredAgents) {
    const id = agent.id?.trim();
    if (id) configuredById.set(id, agent);
  }
  const options = new Map<string, LocalAgentOption>();

  for (const agent of BUILT_IN_LOCAL_AGENT_OPTIONS) {
    const configured = configuredById.get(agent.id);
    if (configured?.enabled === false) continue;
    options.set(agent.id, { id: agent.id, label: agent.label });
  }

  for (const agent of configuredAgents) {
    const id = agent.id?.trim();
    if (!id || BUILT_IN_LOCAL_AGENT_IDS.has(id) || agent.enabled === false) {
      continue;
    }
    if (!agent.cmd?.trim()) continue;
    options.set(id, { id, label: agent.label?.trim() || id });
  }

  return Array.from(options.values());
}

export function localAgentLabel(
  agentId: string,
  localAgentOptions: readonly LocalAgentOption[] = BUILT_IN_LOCAL_AGENT_OPTIONS,
): string {
  return localAgentOptions.find((agent) => agent.id === agentId)?.label ?? agentId;
}

export function agentCliRouteLabel(
  value?: string | null,
  localAgentOptions: readonly LocalAgentOption[] = BUILT_IN_LOCAL_AGENT_OPTIONS,
  t?: TranslateFn,
): string | null {
  const agentId = parseAgentCliRouteValue(value);
  if (!agentId) return null;

  const label = localAgentLabel(agentId, localAgentOptions);
  return t
    ? t("appShell.llmProviders.featureSelect.localAgentCliValue", { agent: label })
    : label;
}

export const KIND_OPTIONS: Array<{
  value: LlmProviderKind;
  labelKey: string;
  hintKey: string;
}> = [
  {
    value: "openai-compatible",
    labelKey: "appShell.llmProviders.kindOptions.openaiCompatible.label",
    hintKey: "appShell.llmProviders.kindOptions.openaiCompatible.hint",
  },
  {
    value: "anthropic-compatible",
    labelKey: "appShell.llmProviders.kindOptions.anthropicCompatible.label",
    hintKey: "appShell.llmProviders.kindOptions.anthropicCompatible.hint",
  },
];

export const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = "4096";
export const DEFAULT_PROVIDER_TIMEOUT_MS = "20000";
export const FEATURE_LANGUAGE_OPTIONS = getWikiLanguageOptions().filter(
  (option) => option.value !== "other",
);

export function normalizeFeatureLanguage(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function languageButtonLabel(
  language: string | null | undefined,
  t: TranslateFn,
): string {
  return normalizeFeatureLanguage(language) ?? t("appShell.llmProviders.common.outputLanguage");
}

export function resolveFeatureLanguagePreset(language?: string | null): string {
  const normalized = normalizeFeatureLanguage(language)?.toLowerCase();
  if (!normalized) return "";

  const matched = FEATURE_LANGUAGE_OPTIONS.find(
    (option) =>
      option.value.toLowerCase() === normalized ||
      option.label.toLowerCase() === normalized,
  );
  return matched?.value ?? "other";
}

export function defaultMaxOutputTokens(kind: LlmProviderKind): string {
  return kind === "anthropic-compatible"
    ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
    : "";
}

function nextProviderClientKey(existing: ProviderDraft[]): string {
  const used = new Set(existing.map((provider) => provider.clientKey));
  let index = existing.length + 1;
  let candidate = `provider-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `provider-${index}`;
  }
  return candidate;
}

export function slugifyProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fallbackProviderName(providerId: string): string {
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDraftIdMap(providers: ProviderDraft[]): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const provider of providers) {
    const baseId =
      slugifyProviderId(provider.name) || provider.persistedId.trim();
    if (!baseId) continue;

    let candidate = baseId;
    let suffix = 2;
    while ([...mapping.values()].includes(candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    mapping.set(provider.clientKey, candidate);
  }

  return mapping;
}

export function buildProviderNameIssues(
  providers: ProviderDraft[],
  t: TranslateFn,
): Record<string, string | null> {
  const generatedByClientKey = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const provider of providers) {
    const name = provider.name.trim();
    if (!name) continue;
    const generatedId = slugifyProviderId(name);
    if (!generatedId) continue;
    if ([...generatedByClientKey.values()].includes(generatedId)) {
      duplicates.add(generatedId);
    } else {
      generatedByClientKey.set(provider.clientKey, generatedId);
    }
  }

  return Object.fromEntries(
    providers.map((provider) => {
      const name = provider.name.trim();
      if (!name) {
        return [
          provider.clientKey,
          t("appShell.llmProviders.validation.providerNameRequired"),
        ];
      }
      const generatedId = slugifyProviderId(name);
      if (!generatedId) {
        return [
          provider.clientKey,
          t("appShell.llmProviders.validation.providerNameInvalid"),
        ];
      }
      if (duplicates.has(generatedId)) {
        return [
          provider.clientKey,
          t("appShell.llmProviders.validation.providerNameDuplicated"),
        ];
      }
      return [provider.clientKey, null];
    }),
  );
}

export function providerLabel(
  provider: Pick<ProviderDraft, "name" | "persistedId">,
): string {
  return provider.name.trim() || provider.persistedId;
}

export function validateProvider(
  provider: ProviderDraft,
  providers: ProviderDraft[],
  t: TranslateFn,
): string | null {
  const nameIssue = buildProviderNameIssues(providers, t)[provider.clientKey];
  if (nameIssue) {
    return nameIssue;
  }

  const trimmedTimeout = provider.timeout_ms.trim();
  if (trimmedTimeout) {
    if (!/^\d+$/.test(trimmedTimeout)) {
      return t("appShell.llmProviders.validation.timeoutWholeNumber", {
        provider: providerLabel(provider),
      });
    }
    const timeoutMs = Number(trimmedTimeout);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
      return t("appShell.llmProviders.validation.timeoutOutOfRange", {
        provider: providerLabel(provider),
      });
    }
  }

  const trimmedMaxOutputTokens = provider.max_output_tokens.trim();
  if (trimmedMaxOutputTokens) {
    if (!/^\d+$/.test(trimmedMaxOutputTokens)) {
      return t("appShell.llmProviders.validation.maxOutputTokensWholeNumber", {
        provider: providerLabel(provider),
      });
    }
    const maxOutputTokens = Number(trimmedMaxOutputTokens);
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens <= 0 ||
      maxOutputTokens > 4294967295
    ) {
      return t("appShell.llmProviders.validation.maxOutputTokensOutOfRange", {
        provider: providerLabel(provider),
      });
    }
  } else if (provider.kind === "anthropic-compatible") {
    return t("appShell.llmProviders.validation.anthropicMaxOutputTokensRequired", {
      provider: providerLabel(provider),
    });
  }

  return null;
}

export function validateRouting(
  routing: RoutingDraft,
  providers: ProviderDraft[],
  t: TranslateFn,
): string | null {
  const clientKeys = new Set(providers.map((provider) => provider.clientKey));
  for (const selected of [
    routing.features.git_commit ?? null,
    routing.features.workspace_issue_todo ?? null,
  ]) {
    if (parseAgentCliRouteValue(selected)) {
      continue;
    }
    if (selected && !clientKeys.has(selected)) {
      return t("appShell.llmProviders.validation.routingProviderMissing");
    }
  }
  return null;
}

export function fileToModalState(config: LlmProvidersFile): ModalDraftState {
  // local-managed and agent-cli providers are not edited in this provider editor.
  const providers = Object.entries(config.providers ?? {})
    .filter(
      ([, provider]) =>
        provider.kind !== "local-managed" && provider.kind !== "agent-cli",
    )
    .map(([id, provider], index) => ({
      clientKey: `provider-${index + 1}-${id}`,
      persistedId: id,
      enabled: provider.enabled,
      name: provider.displayName ?? fallbackProviderName(id),
      kind: provider.kind,
      base_url: provider.base_url ?? "",
      api_key: provider.api_key ?? "",
      model: provider.model ?? "",
      timeout_ms:
        provider.timeout_ms == null ? "" : String(provider.timeout_ms),
      max_output_tokens:
        provider.max_output_tokens == null
          ? defaultMaxOutputTokens(provider.kind)
          : String(provider.max_output_tokens),
    }));

  const persistedToClientKey = new Map(
    providers.map((provider) => [provider.persistedId, provider.clientKey]),
  );

  const featureBindingToDraftValue = (providerId?: string | null): string | null => {
    if (!providerId) return null;
    if (parseAgentCliRouteValue(providerId)) return providerId;

    const mapped = persistedToClientKey.get(providerId);
    if (mapped) return mapped;

    const provider = config.providers?.[providerId];
    if (provider?.kind === "agent-cli") {
      const agentId = provider.agent_id?.trim() || provider.model?.trim();
      return agentId ? agentCliRouteValue(agentId) : null;
    }

    return null;
  };

  return {
    version: config.version ?? 1,
    providers,
    routing: {
      features: {
        git_commit: featureBindingToDraftValue(config.features?.git_commit),
        git_commit_language: normalizeFeatureLanguage(
          config.features?.git_commit_language,
        ),
        workspace_issue_todo: featureBindingToDraftValue(
          config.features?.workspace_issue_todo,
        ),
        workspace_issue_todo_language: normalizeFeatureLanguage(
          config.features?.workspace_issue_todo_language,
        ),
      },
    },
  };
}

export function modalStateToFile(
  state: ModalDraftState,
  originalConfig?: LlmProvidersFile,
): LlmProvidersFile {
  const providerIdMap = buildDraftIdMap(state.providers);

  // Preserve local-managed providers that were stripped from the editor state.
  const localManagedProviders: Record<string, LlmProviderEntry> =
    Object.fromEntries(
      Object.entries(originalConfig?.providers ?? {}).filter(
        ([, p]) => p.kind === "local-managed",
      ),
    );

  // Resolve a feature binding from the draft. When the draft has no value
  // and the original config bound this feature to a still-present
  // local-managed provider, preserve that binding so the editor (which
  // intentionally hides local-managed providers from its dropdowns) does
  // not silently clear local routing on save.
  const resolveFeatureBinding = (
    draftKey: string | null | undefined,
    originalProviderId: string | null | undefined,
  ): string | null => {
    if (draftKey) {
      if (parseAgentCliRouteValue(draftKey)) {
        return draftKey;
      }
      return providerIdMap.get(draftKey) ?? null;
    }
    if (originalProviderId && localManagedProviders[originalProviderId]) {
      return originalProviderId;
    }
    return null;
  };

  const providers = state.providers.reduce<Record<string, LlmProviderEntry>>(
    (acc, provider) => {
      const providerId = providerIdMap.get(provider.clientKey);
      if (!providerId) {
        return acc;
      }

      const trimmedTimeout = provider.timeout_ms.trim();
      const trimmedMaxOutputTokens = provider.max_output_tokens.trim();

      acc[providerId] = {
        enabled: provider.enabled,
        displayName: provider.name.trim() || null,
        kind: provider.kind,
        base_url: provider.base_url.trim(),
        api_key: provider.api_key.trim(),
        model: provider.model.trim(),
        agent_id: null,
        timeout_ms: trimmedTimeout ? parseInt(trimmedTimeout, 10) : null,
        max_output_tokens: trimmedMaxOutputTokens
          ? parseInt(trimmedMaxOutputTokens, 10)
          : null,
      };
      return acc;
    },
    { ...localManagedProviders },
  );

  return {
    version: state.version || 1,
    default_provider: null,
    features: {
      git_commit: resolveFeatureBinding(
        state.routing.features.git_commit,
        originalConfig?.features?.git_commit,
      ),
      git_commit_language: normalizeFeatureLanguage(
        state.routing.features.git_commit_language,
      ),
      workspace_issue_todo: resolveFeatureBinding(
        state.routing.features.workspace_issue_todo,
        originalConfig?.features?.workspace_issue_todo,
      ),
      workspace_issue_todo_language: normalizeFeatureLanguage(
        state.routing.features.workspace_issue_todo_language,
      ),
    },
    providers,
  };
}

export function providerDraftToEntry(provider: ProviderDraft): LlmProviderEntry {
  const trimmedTimeout = provider.timeout_ms.trim();
  const trimmedMaxOutputTokens = provider.max_output_tokens.trim();

  return {
    enabled: provider.enabled,
    displayName: provider.name.trim() || null,
    kind: provider.kind,
    base_url: provider.base_url.trim(),
    api_key: provider.api_key.trim(),
    model: provider.model.trim(),
    agent_id: null,
    timeout_ms: trimmedTimeout ? parseInt(trimmedTimeout, 10) : null,
    max_output_tokens: trimmedMaxOutputTokens
      ? parseInt(trimmedMaxOutputTokens, 10)
      : null,
  };
}

export function newProviderDraft(existing: ProviderDraft[]): ProviderDraft {
  return {
    clientKey: nextProviderClientKey(existing),
    persistedId: "",
    enabled: true,
    name: "",
    kind: "openai-compatible",
    base_url: "",
    api_key: "",
    model: "",
    timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
    max_output_tokens: "",
  };
}

export function scheduleSaveStateReset(
  setState: React.Dispatch<React.SetStateAction<SaveState>>,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  timerRef.current = setTimeout(() => {
    setState("idle");
    timerRef.current = null;
  }, 3000);
}
