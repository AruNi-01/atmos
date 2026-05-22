import type React from "react";

import {
  type LlmFeatureBindings,
  type LlmProviderEntry,
  type LlmProviderKind,
  type LlmProvidersFile,
  type SessionTitleFormatConfig,
} from "@/api/ws-api";
import { WIKI_LANGUAGE_OPTIONS } from "@/features/wiki/lib/wiki-languages";

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

export type ModalDraftState = {
  version: number;
  providers: ProviderDraft[];
  routing: RoutingDraft;
};

export type SaveState = "idle" | "saving" | "saved";

export const DEFAULT_SESSION_TITLE_FORMAT: SessionTitleFormatConfig = {
  include_agent_name: false,
  include_project_name: false,
  include_intent_emoji: false,
};

export const EMPTY_ROUTING: RoutingDraft = {
  features: {
    git_commit_language: null,
    session_title_format: DEFAULT_SESSION_TITLE_FORMAT,
    workspace_issue_todo_language: null,
  },
};

export const KIND_OPTIONS: Array<{
  value: LlmProviderKind;
  label: string;
  hint: string;
}> = [
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    hint: "/chat/completions style endpoints",
  },
  {
    value: "anthropic-compatible",
    label: "Anthropic-compatible",
    hint: "/v1/messages style endpoints",
  },
];

export const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = "4096";
export const DEFAULT_PROVIDER_TIMEOUT_MS = "20000";
export const FEATURE_LANGUAGE_OPTIONS = WIKI_LANGUAGE_OPTIONS.filter(
  (option) => option.value !== "other",
);

export function normalizeFeatureLanguage(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function languageButtonLabel(language?: string | null): string {
  return normalizeFeatureLanguage(language) ?? "Output language";
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
        return [provider.clientKey, "Provider name is required."];
      }
      const generatedId = slugifyProviderId(name);
      if (!generatedId) {
        return [
          provider.clientKey,
          "Provider name must contain letters or numbers.",
        ];
      }
      if (duplicates.has(generatedId)) {
        return [provider.clientKey, "Provider name is duplicated."];
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
): string | null {
  const nameIssue = buildProviderNameIssues(providers)[provider.clientKey];
  if (nameIssue) {
    return nameIssue;
  }

  const trimmedTimeout = provider.timeout_ms.trim();
  if (trimmedTimeout) {
    if (!/^\d+$/.test(trimmedTimeout)) {
      return `Timeout for provider "${providerLabel(provider)}" must be a whole number in milliseconds.`;
    }
    const timeoutMs = Number(trimmedTimeout);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
      return `Timeout for provider "${providerLabel(provider)}" is out of range.`;
    }
  }

  const trimmedMaxOutputTokens = provider.max_output_tokens.trim();
  if (trimmedMaxOutputTokens) {
    if (!/^\d+$/.test(trimmedMaxOutputTokens)) {
      return `Max output tokens for provider "${providerLabel(provider)}" must be a whole number.`;
    }
    const maxOutputTokens = Number(trimmedMaxOutputTokens);
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens <= 0 ||
      maxOutputTokens > 4294967295
    ) {
      return `Max output tokens for provider "${providerLabel(provider)}" is out of range.`;
    }
  } else if (provider.kind === "anthropic-compatible") {
    return `Anthropic-compatible provider "${providerLabel(provider)}" requires max output tokens.`;
  }

  return null;
}

export function validateRouting(
  routing: RoutingDraft,
  providers: ProviderDraft[],
): string | null {
  const clientKeys = new Set(providers.map((provider) => provider.clientKey));
  for (const selected of [
    routing.features.session_title ?? null,
    routing.features.git_commit ?? null,
    routing.features.workspace_issue_todo ?? null,
  ]) {
    if (selected && !clientKeys.has(selected)) {
      return "Routing references a provider that does not exist.";
    }
  }
  return null;
}

export function normalizeSessionTitleFormat(
  value?: SessionTitleFormatConfig | null,
): SessionTitleFormatConfig {
  return {
    include_agent_name: !!value?.include_agent_name,
    include_project_name: !!value?.include_project_name,
    include_intent_emoji: !!value?.include_intent_emoji,
  };
}

export function fileToModalState(config: LlmProvidersFile): ModalDraftState {
  // local-managed providers are managed by LocalModelPanel, not this editor.
  const providers = Object.entries(config.providers ?? {})
    .filter(([, provider]) => provider.kind !== "local-managed")
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

  return {
    version: config.version ?? 1,
    providers,
    routing: {
      features: {
        session_title: config.features?.session_title
          ? (persistedToClientKey.get(config.features.session_title) ?? null)
          : null,
        git_commit: config.features?.git_commit
          ? (persistedToClientKey.get(config.features.git_commit) ?? null)
          : null,
        git_commit_language: normalizeFeatureLanguage(
          config.features?.git_commit_language,
        ),
        workspace_issue_todo: config.features?.workspace_issue_todo
          ? (persistedToClientKey.get(config.features.workspace_issue_todo) ??
            null)
          : null,
        workspace_issue_todo_language: normalizeFeatureLanguage(
          config.features?.workspace_issue_todo_language,
        ),
        session_title_format: normalizeSessionTitleFormat(
          config.features?.session_title_format,
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
      session_title: resolveFeatureBinding(
        state.routing.features.session_title,
        originalConfig?.features?.session_title,
      ),
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
      session_title_format: normalizeSessionTitleFormat(
        state.routing.features.session_title_format,
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
    timeout_ms: trimmedTimeout ? parseInt(trimmedTimeout, 10) : null,
    max_output_tokens: trimmedMaxOutputTokens
      ? parseInt(trimmedMaxOutputTokens, 10)
      : null,
  };
}

export function featureSelectValue(value?: string | null): string {
  return value || "__none__";
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

export function sessionTitleFormatPreview(format: SessionTitleFormatConfig): string {
  const segments: string[] = [];
  if (format.include_agent_name) segments.push("[agentName]");
  if (format.include_project_name) segments.push("[projectName]");
  segments.push(format.include_intent_emoji ? "🎨 title desc" : "title desc");
  return segments.join(" | ");
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
