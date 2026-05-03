"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  Check,
  Languages,
  LoaderCircle,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  cn,
  toastManager,
} from "@workspace/ui";

import {
  llmProvidersApi,
  type LlmFeatureBindings,
  type LlmProviderEntry,
  type LlmProviderKind,
  type LlmProvidersFile,
  type SessionTitleFormatConfig,
} from "@/api/ws-api";
import { WIKI_LANGUAGE_OPTIONS } from "@/components/wiki/wiki-languages";
import { useWebSocketStore } from "@/hooks/use-websocket";

type ProviderDraft = {
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

type RoutingDraft = {
  features: LlmFeatureBindings;
};

type ModalDraftState = {
  version: number;
  providers: ProviderDraft[];
  routing: RoutingDraft;
};

type SaveState = "idle" | "saving" | "saved";

const DEFAULT_SESSION_TITLE_FORMAT: SessionTitleFormatConfig = {
  include_agent_name: false,
  include_project_name: false,
  include_intent_emoji: false,
};

const EMPTY_ROUTING: RoutingDraft = {
  features: {
    git_commit_language: null,
    session_title_format: DEFAULT_SESSION_TITLE_FORMAT,
    workspace_issue_todo_language: null,
  },
};

const KIND_OPTIONS: Array<{
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

const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = "4096";
const DEFAULT_PROVIDER_TIMEOUT_MS = "20000";
const FEATURE_LANGUAGE_OPTIONS = WIKI_LANGUAGE_OPTIONS.filter(
  (option) => option.value !== "other",
);

function normalizeFeatureLanguage(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function languageButtonLabel(language?: string | null): string {
  return normalizeFeatureLanguage(language) ?? "Output language";
}

function resolveFeatureLanguagePreset(language?: string | null): string {
  const normalized = normalizeFeatureLanguage(language)?.toLowerCase();
  if (!normalized) return "";

  const matched = FEATURE_LANGUAGE_OPTIONS.find(
    (option) =>
      option.value.toLowerCase() === normalized ||
      option.label.toLowerCase() === normalized,
  );
  return matched?.value ?? "other";
}

function defaultMaxOutputTokens(kind: LlmProviderKind): string {
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

function slugifyProviderId(value: string): string {
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

function buildProviderNameIssues(
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

function validateProvider(
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

function validateRouting(
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

function fileToModalState(config: LlmProvidersFile): ModalDraftState {
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

function modalStateToFile(
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
      session_title: state.routing.features.session_title
        ? (providerIdMap.get(state.routing.features.session_title) ?? null)
        : null,
      git_commit: state.routing.features.git_commit
        ? (providerIdMap.get(state.routing.features.git_commit) ?? null)
        : null,
      git_commit_language: normalizeFeatureLanguage(
        state.routing.features.git_commit_language,
      ),
      workspace_issue_todo: state.routing.features.workspace_issue_todo
        ? (providerIdMap.get(state.routing.features.workspace_issue_todo) ??
          null)
        : null,
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

function providerDraftToEntry(provider: ProviderDraft): LlmProviderEntry {
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

function providerLabel(
  provider: Pick<ProviderDraft, "name" | "persistedId">,
): string {
  return provider.name.trim() || provider.persistedId;
}

function featureSelectValue(value?: string | null): string {
  return value || "__none__";
}

function newProviderDraft(existing: ProviderDraft[]): ProviderDraft {
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

function normalizeSessionTitleFormat(
  value?: SessionTitleFormatConfig | null,
): SessionTitleFormatConfig {
  return {
    include_agent_name: !!value?.include_agent_name,
    include_project_name: !!value?.include_project_name,
    include_intent_emoji: !!value?.include_intent_emoji,
  };
}

function sessionTitleFormatPreview(format: SessionTitleFormatConfig): string {
  const segments: string[] = [];
  if (format.include_agent_name) segments.push("[agentName]");
  if (format.include_project_name) segments.push("[projectName]");
  segments.push(format.include_intent_emoji ? "🎨 title desc" : "title desc");
  return segments.join(" | ");
}

function scheduleSaveStateReset(
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

function useResetTimer(timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [timerRef],
  );
}

export function LlmProviderEditorDialog({
  open,
  onOpenChange,
  providerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId?: string | null;
  onSaved?: () => void;
}) {
  const [version, setVersion] = useState(1);
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [routingDraft, setRoutingDraft] = useState<RoutingDraft>(EMPTY_ROUTING);
  const [providerEditor, setProviderEditor] = useState<ProviderDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<LlmProvidersFile | null>(null);
  const [providerSaveState, setProviderSaveState] = useState<SaveState>("idle");
  const [providerNameTouched, setProviderNameTouched] = useState(false);
  const [providerSaveAttempted, setProviderSaveAttempted] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [testPopoverOpen, setTestPopoverOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "pass" | "fail">("idle");
  const [testOutput, setTestOutput] = useState("");
  const providerResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const providerTestUnsubscribeRef = useRef<(() => void) | null>(null);

  useResetTimer(providerResetTimerRef);
  useEffect(
    () => () => {
      providerTestUnsubscribeRef.current?.();
    },
    [],
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setOriginalConfig(config);
      const nextState = fileToModalState(config);
      setVersion(nextState.version);
      setProviders(nextState.providers);
      setRoutingDraft(nextState.routing);

      if (providerId) {
        const selected = nextState.providers.find(
          (provider) => provider.persistedId === providerId,
        );
        if (!selected) {
          toastManager.add({
            title: "Provider not found",
            description: "The selected provider no longer exists.",
            type: "error",
          });
          onOpenChange(false);
          return;
        }
        setProviderEditor({ ...selected });
      } else {
        setProviderEditor(newProviderDraft(nextState.providers));
      }

      setProviderNameTouched(false);
      setProviderSaveAttempted(false);
      setProviderSaveState("idle");
      setTestStatus("idle");
      setTestOutput("");
    } catch (error) {
      toastManager.add({
        title: "Failed to load provider settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange, providerId]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [loadConfig, open]);

  const providerEditorCandidates = useMemo(() => {
    if (!providerEditor) return providers;
    return [
      ...providers.filter(
        (provider) => provider.clientKey !== providerEditor.clientKey,
      ),
      providerEditor,
    ];
  }, [providers, providerEditor]);

  const providerNameIssue = useMemo(() => {
    if (!providerEditor) return null;
    return buildProviderNameIssues(providerEditorCandidates)[
      providerEditor.clientKey
    ];
  }, [providerEditor, providerEditorCandidates]);

  const showProviderNameIssue =
    !!providerNameIssue && (providerNameTouched || providerSaveAttempted);

  const handleTestProvider = async () => {
    if (!providerEditor) return;

    setTestPopoverOpen(true);
    setTestStatus("testing");
    setTestOutput("");
    providerTestUnsubscribeRef.current?.();

    const streamId = crypto.randomUUID();
    let streamedOutput = "";

    providerTestUnsubscribeRef.current = useWebSocketStore
      .getState()
      .onEvent("llm_provider_test_chunk", (payload) => {
        if (
          typeof payload !== "object" ||
          payload === null ||
          (payload as { stream_id?: unknown }).stream_id !== streamId
        ) {
          return;
        }

        const chunk = (payload as { chunk?: unknown }).chunk;
        if (typeof chunk !== "string" || chunk.length === 0) return;

        streamedOutput += chunk;
        setTestOutput(streamedOutput);
      });

    try {
      const result = await llmProvidersApi.testProvider({
        stream_id: streamId,
        provider_id: providerEditor.persistedId || null,
        provider: providerDraftToEntry(providerEditor),
      });
      setTestStatus("pass");
      setTestOutput(streamedOutput || result.text || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestStatus("fail");
      setTestOutput(
        streamedOutput ? `${streamedOutput}\n\n[ERROR] ${message}` : `[ERROR] ${message}`,
      );
    } finally {
      providerTestUnsubscribeRef.current?.();
      providerTestUnsubscribeRef.current = null;
    }
  };

  const handleSaveProvider = async () => {
    if (!providerEditor) return;

    setProviderSaveAttempted(true);
    const validationError = validateProvider(
      providerEditor,
      providerEditorCandidates,
    );
    if (validationError) {
      toastManager.add({
        title: "Invalid provider settings",
        description: validationError,
        type: "error",
      });
      return;
    }

    const nextProviders = [
      ...providers.filter(
        (provider) => provider.clientKey !== providerEditor.clientKey,
      ),
      providerEditor,
    ];

    setProviderSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile(
          { version, providers: nextProviders, routing: routingDraft },
          originalConfig ?? undefined,
        ),
      );
      setProviderSaveState("saved");
      scheduleSaveStateReset(setProviderSaveState, providerResetTimerRef);
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to save provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const handleDeleteProvider = async () => {
    if (!providerEditor?.persistedId) return;

    const nextProviders = providers.filter(
      (provider) => provider.clientKey !== providerEditor.clientKey,
    );
    const nextRouting: RoutingDraft = {
      features: {
        session_title:
          routingDraft.features.session_title === providerEditor.clientKey
            ? null
            : routingDraft.features.session_title,
        git_commit:
          routingDraft.features.git_commit === providerEditor.clientKey
            ? null
            : routingDraft.features.git_commit,
        git_commit_language: normalizeFeatureLanguage(
          routingDraft.features.git_commit_language,
        ),
        workspace_issue_todo:
          routingDraft.features.workspace_issue_todo === providerEditor.clientKey
            ? null
            : routingDraft.features.workspace_issue_todo,
        workspace_issue_todo_language: normalizeFeatureLanguage(
          routingDraft.features.workspace_issue_todo_language,
        ),
        session_title_format: normalizeSessionTitleFormat(
          routingDraft.features.session_title_format,
        ),
      },
    };

    setProviderSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile(
          { version, providers: nextProviders, routing: nextRouting },
          originalConfig ?? undefined,
        ),
      );
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to delete provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const selectedProviderIsUnsaved =
    !!providerEditor && !providerEditor.persistedId;
  const selectedProviderHint = selectedProviderIsUnsaved
    ? "New provider"
    : providerEditor
      ? KIND_OPTIONS.find((item) => item.value === providerEditor.kind)?.hint
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,720px)] max-w-[720px] border-border bg-background p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm">
              <BrainCircuit className="size-4 text-primary" />
            </div>
            {providerId ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription>
            {selectedProviderHint ?? "Configure a lightweight provider for background tasks."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {loading || !providerEditor ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Provider name"
                labelAccessory={
                  showProviderNameIssue && providerNameIssue ? (
                    <span className="text-xs font-medium text-destructive">
                      {providerNameIssue}
                    </span>
                  ) : null
                }
                error={showProviderNameIssue}
              >
                <Input
                  value={providerEditor.name}
                  onChange={(event) => {
                    setProviderNameTouched(true);
                    setProviderEditor((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    );
                  }}
                  placeholder="OpenRouter Fast"
                  className={cn(
                    showProviderNameIssue &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />
              </Field>

              <Field label="Provider key">
                <Input
                  value={
                    providerEditor.name.trim()
                      ? slugifyProviderId(providerEditor.name)
                      : ""
                  }
                  placeholder="Generated from name"
                  disabled
                />
              </Field>

              <Field label="Compatibility">
                <Select
                  value={providerEditor.kind}
                  onValueChange={(value) => {
                    const kind = value as LlmProviderKind;
                    const shouldSeedAnthropicDefault =
                      !providerEditor.max_output_tokens.trim() &&
                      kind === "anthropic-compatible";
                    setProviderEditor((current) =>
                      current
                        ? {
                            ...current,
                            kind,
                            max_output_tokens: shouldSeedAnthropicDefault
                              ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
                              : current.max_output_tokens,
                          }
                        : current,
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Enabled">
                <div className="flex h-10 items-center justify-between rounded-xl border border-border px-3">
                  <span className="text-sm text-foreground">Provider status</span>
                  <Switch
                    checked={providerEditor.enabled}
                    onCheckedChange={(checked) =>
                      setProviderEditor((current) =>
                        current ? { ...current, enabled: checked } : current,
                      )
                    }
                  />
                </div>
              </Field>

              <Field label="Timeout (ms)">
                <Input
                  value={providerEditor.timeout_ms}
                  onChange={(event) =>
                    setProviderEditor((current) =>
                      current ? { ...current, timeout_ms: event.target.value } : current,
                    )
                  }
                  placeholder={DEFAULT_PROVIDER_TIMEOUT_MS}
                />
              </Field>

              <Field label="Max output tokens">
                <Input
                  value={providerEditor.max_output_tokens}
                  onChange={(event) =>
                    setProviderEditor((current) =>
                      current
                        ? { ...current, max_output_tokens: event.target.value }
                        : current,
                    )
                  }
                  placeholder={
                    providerEditor.kind === "anthropic-compatible"
                      ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
                      : "Optional"
                  }
                />
              </Field>

              <Field label="Base URL" className="md:col-span-2">
                <Input
                  value={providerEditor.base_url}
                  onChange={(event) =>
                    setProviderEditor((current) =>
                      current ? { ...current, base_url: event.target.value } : current,
                    )
                  }
                  placeholder={
                    providerEditor.kind === "anthropic-compatible"
                      ? "https://api.anthropic.com"
                      : "https://openrouter.ai/api/v1"
                  }
                />
              </Field>

              <Field label="API key" className="md:col-span-2">
                <Input
                  type="password"
                  value={providerEditor.api_key}
                  onChange={(event) =>
                    setProviderEditor((current) =>
                      current ? { ...current, api_key: event.target.value } : current,
                    )
                  }
                  placeholder="sk-... or env:OPENROUTER_API_KEY"
                />
              </Field>

              <Field label="Model" className="md:col-span-2">
                <Input
                  value={providerEditor.model}
                  onChange={(event) =>
                    setProviderEditor((current) =>
                      current ? { ...current, model: event.target.value } : current,
                    )
                  }
                  placeholder={
                    providerEditor.kind === "anthropic-compatible"
                      ? "claude-3-5-haiku-latest"
                      : "openrouter/auto"
                  }
                />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center">
            <div className="flex min-w-0 flex-1 items-center">
              {providerId ? (
                <Popover open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={providerSaveState === "saving" || loading}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 space-y-3 p-4" side="top" align="start">
                    <p className="text-sm text-foreground">Delete this provider?</p>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          void handleDeleteProvider();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              )}
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              {providerId ? (
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              ) : null}
              <Popover open={testPopoverOpen} onOpenChange={setTestPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="secondary"
                    className={cn(
                      "px-3",
                      testStatus === "pass" &&
                        "text-emerald-700 hover:text-emerald-700 dark:text-emerald-300",
                      testStatus === "fail" &&
                        "text-destructive hover:text-destructive",
                      testStatus === "testing" &&
                        "text-amber-700 hover:text-amber-700 dark:text-amber-300",
                    )}
                    onClick={() => {
                      void handleTestProvider();
                    }}
                    disabled={loading || !providerEditor}
                  >
                    {testStatus === "testing"
                      ? "TESTING..."
                      : testStatus === "pass"
                        ? "PASS"
                        : testStatus === "fail"
                          ? "FAIL"
                          : "TEST"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[420px] p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Provider Test</p>
                      <Button variant="ghost" onClick={() => void handleTestProvider()}>
                        RETEST
                      </Button>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                      {testOutput ||
                        (testStatus === "testing"
                          ? "Streaming response..."
                          : "Click TEST to start.")}
                    </pre>
                  </div>
                </PopoverContent>
              </Popover>
              <SaveStateButton
                state={providerSaveState}
                idleLabel={providerId ? "Save changes" : "Create provider"}
                savingLabel="Saving..."
                savedLabel="Saved"
                onClick={() => void handleSaveProvider()}
                disabled={providerSaveState === "saving" || loading || !providerEditor}
                measureLabel={providerId ? "Save changes" : "Create provider"}
              />
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LlmRoutingDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [version, setVersion] = useState(1);
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [routingDraft, setRoutingDraft] = useState<RoutingDraft>(EMPTY_ROUTING);
  const [loading, setLoading] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<LlmProvidersFile | null>(null);
  const [routingSaveState, setRoutingSaveState] = useState<SaveState>("idle");
  const [titleFormatSaveState, setTitleFormatSaveState] =
    useState<SaveState>("idle");
  const [sessionTitleFormatOpen, setSessionTitleFormatOpen] = useState(false);
  const [sessionTitleFormatDraft, setSessionTitleFormatDraft] =
    useState<SessionTitleFormatConfig>(DEFAULT_SESSION_TITLE_FORMAT);
  const routingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFormatResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useResetTimer(routingResetTimerRef);
  useResetTimer(titleFormatResetTimerRef);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setOriginalConfig(config);
      const nextState = fileToModalState(config);
      setVersion(nextState.version);
      setProviders(nextState.providers);
      setRoutingDraft(nextState.routing);
      setSessionTitleFormatDraft(
        normalizeSessionTitleFormat(
          nextState.routing.features.session_title_format,
        ),
      );
      setRoutingSaveState("idle");
      setTitleFormatSaveState("idle");
    } catch (error) {
      toastManager.add({
        title: "Failed to load routing settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [loadConfig, open]);

  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        value: provider.clientKey,
        label: providerLabel(provider),
      })),
    [providers],
  );

  const handleSaveRouting = async () => {
    const validationError = validateRouting(routingDraft, providers);
    if (validationError) {
      toastManager.add({
        title: "Invalid routing settings",
        description: validationError,
        type: "error",
      });
      return;
    }

    setRoutingSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile(
          { version, providers, routing: routingDraft },
          originalConfig ?? undefined,
        ),
      );
      setRoutingSaveState("saved");
      scheduleSaveStateReset(setRoutingSaveState, routingResetTimerRef);
      onSaved?.();
    } catch (error) {
      setRoutingSaveState("idle");
      toastManager.add({
        title: "Failed to save routing settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const handleOpenSessionTitleFormat = () => {
    setSessionTitleFormatDraft(
      normalizeSessionTitleFormat(routingDraft.features.session_title_format),
    );
    setSessionTitleFormatOpen(true);
  };

  const handleSaveSessionTitleFormat = async () => {
    const normalized = normalizeSessionTitleFormat(sessionTitleFormatDraft);
    const nextRouting: RoutingDraft = {
      features: {
        ...routingDraft.features,
        session_title_format: normalized,
      },
    };

    setTitleFormatSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile(
          { version, providers, routing: nextRouting },
          originalConfig ?? undefined,
        ),
      );
      setRoutingDraft(nextRouting);
      setSessionTitleFormatDraft(normalized);
      setTitleFormatSaveState("saved");
      scheduleSaveStateReset(
        setTitleFormatSaveState,
        titleFormatResetTimerRef,
      );
      onSaved?.();
    } catch (error) {
      setTitleFormatSaveState("idle");
      toastManager.add({
        title: "Failed to save title format",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(94vw,720px)] max-w-[720px] border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm">
                <BrainCircuit className="size-4 text-primary" />
              </div>
              Routing
            </DialogTitle>
            <DialogDescription>
              Choose which provider handles each lightweight background feature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                <FeatureSelect
                  label="Session title generator"
                  value={routingDraft.features.session_title}
                  providerOptions={providerOptions}
                  noneLabel="Disabled"
                  action={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleOpenSessionTitleFormat}
                      title="Edit session title format"
                      aria-label="Edit session title format"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  }
                  onChange={(value) =>
                    setRoutingDraft((current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        session_title: value,
                      },
                    }))
                  }
                />

                <FeatureSelect
                  label="Git commit generator"
                  value={routingDraft.features.git_commit}
                  providerOptions={providerOptions}
                  noneLabel="Disabled"
                  action={
                    <FeatureLanguageAction
                      value={routingDraft.features.git_commit_language}
                      onChange={(language) =>
                        setRoutingDraft((current) => ({
                          ...current,
                          features: {
                            ...current.features,
                            git_commit_language: language,
                          },
                        }))
                      }
                    />
                  }
                  onChange={(value) =>
                    setRoutingDraft((current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        git_commit: value,
                      },
                    }))
                  }
                />

                <FeatureSelect
                  label="Workspace issue TODO extraction"
                  value={routingDraft.features.workspace_issue_todo}
                  providerOptions={providerOptions}
                  noneLabel="Disabled"
                  action={
                    <FeatureLanguageAction
                      value={routingDraft.features.workspace_issue_todo_language}
                      onChange={(language) =>
                        setRoutingDraft((current) => ({
                          ...current,
                          features: {
                            ...current.features,
                            workspace_issue_todo_language: language,
                          },
                        }))
                      }
                    />
                  }
                  onChange={(value) =>
                    setRoutingDraft((current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        workspace_issue_todo: value,
                      },
                    }))
                  }
                />
              </>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <SaveStateButton
              state={routingSaveState}
              idleLabel="Save"
              savingLabel="Saving..."
              savedLabel="Saved"
              onClick={() => void handleSaveRouting()}
              disabled={routingSaveState === "saving" || loading}
              measureLabel="Save"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sessionTitleFormatOpen}
        onOpenChange={setSessionTitleFormatOpen}
      >
        <DialogContent className="w-[min(94vw,640px)] max-w-[640px] border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Session Title Format</DialogTitle>
            <DialogDescription>
              The final title is assembled as a structured format. Temporary
              sessions automatically skip the project segment even when enabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                Final format
              </p>
              <p className="mt-2 font-mono text-sm text-foreground">
                {sessionTitleFormatPreview(sessionTitleFormatDraft)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                `projectName` comes from the current working directory basename.
                Temp sessions skip this segment automatically.
              </p>
            </div>

            <Field
              label="Include Intent Emoji"
              description="Prefix the title description with a single inferred intent emoji, such as 🎨 or 🐞."
            >
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Intent segment</p>
                  <p className="text-xs text-muted-foreground">
                    Example: 🎨 design a retry mechanism
                  </p>
                </div>
                <Switch
                  checked={!!sessionTitleFormatDraft.include_intent_emoji}
                  onCheckedChange={(checked) =>
                    setSessionTitleFormatDraft((current) => ({
                      ...current,
                      include_intent_emoji: !!checked,
                    }))
                  }
                />
              </div>
            </Field>

            <Field
              label="Include Agent Name"
              description="Prefix titles with the current ACP agent display name."
            >
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Agent segment</p>
                  <p className="text-xs text-muted-foreground">
                    Example: Claude Agent | title desc
                  </p>
                </div>
                <Switch
                  checked={!!sessionTitleFormatDraft.include_agent_name}
                  onCheckedChange={(checked) =>
                    setSessionTitleFormatDraft((current) => ({
                      ...current,
                      include_agent_name: !!checked,
                    }))
                  }
                />
              </div>
            </Field>

            <Field
              label="Include Project Name"
              description="Prefix titles with the current project or workspace directory name when available."
            >
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Project segment</p>
                  <p className="text-xs text-muted-foreground">
                    Example: my-project | title desc
                  </p>
                </div>
                <Switch
                  checked={!!sessionTitleFormatDraft.include_project_name}
                  onCheckedChange={(checked) =>
                    setSessionTitleFormatDraft((current) => ({
                      ...current,
                      include_project_name: !!checked,
                    }))
                  }
                />
              </div>
            </Field>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              onClick={() => setSessionTitleFormatOpen(false)}
            >
              Close
            </Button>
            <SaveStateButton
              state={titleFormatSaveState}
              idleLabel="Save format"
              savingLabel="Saving..."
              savedLabel="Saved"
              onClick={() => void handleSaveSessionTitleFormat()}
              disabled={titleFormatSaveState === "saving"}
              measureLabel="Save format"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeatureSelect({
  label,
  value,
  providerOptions,
  noneLabel,
  action,
  onChange,
}: {
  label: string;
  value?: string | null;
  providerOptions: Array<{ value: string; label: string }>;
  noneLabel: string;
  action?: React.ReactNode;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {action}
      </div>
      <Select
        value={featureSelectValue(value)}
        onValueChange={(next) => onChange(next === "__none__" ? null : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={noneLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{noneLabel}</SelectItem>
          {providerOptions.map((provider) => (
            <SelectItem key={provider.value} value={provider.value}>
              {provider.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FeatureLanguageAction({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const preset = resolveFeatureLanguagePreset(value);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(preset);
  const [customValue, setCustomValue] = useState(
    preset === "other" ? normalizeFeatureLanguage(value) ?? "" : "",
  );

  const applySelection = (nextSelection: string, nextCustomValue?: string) => {
    if (!nextSelection) {
      onChange(null);
      return;
    }

    if (nextSelection === "other") {
      const customLanguage = (nextCustomValue ?? customValue).trim();
      onChange(customLanguage || null);
      return;
    }

    const option = FEATURE_LANGUAGE_OPTIONS.find(
      (item) => item.value === nextSelection,
    );
    onChange(option?.label ?? null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          const nextPreset = resolveFeatureLanguagePreset(value);
          setSelection(nextPreset);
          setCustomValue(
            nextPreset === "other"
              ? normalizeFeatureLanguage(value) ?? ""
              : "",
          );
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            normalizeFeatureLanguage(value) && "text-primary",
          )}
          title={languageButtonLabel(value)}
          aria-label={languageButtonLabel(value)}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 space-y-3 p-4"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Output language</p>
          <p className="text-xs text-muted-foreground">
            Force this feature to respond in a specific language.
          </p>
        </div>

        <Select
          value={selection || "__none__"}
          onValueChange={(next) => {
            const normalized = next === "__none__" ? "" : next;
            setSelection(normalized);
            if (normalized && normalized !== "other") {
              applySelection(normalized);
            }
            if (!normalized) {
              applySelection("");
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Use prompt default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Use prompt default</SelectItem>
            {FEATURE_LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="other">Other (custom)</SelectItem>
          </SelectContent>
        </Select>

        {selection === "other" && (
          <Input
            value={customValue}
            placeholder="e.g. 简体中文"
            onChange={(event) => {
              const nextCustomValue = event.target.value;
              setCustomValue(nextCustomValue);
              applySelection("other", nextCustomValue);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function SaveStateButton({
  state,
  idleLabel,
  savingLabel,
  savedLabel,
  measureLabel,
  variant,
  disabled,
  onClick,
}: {
  state: SaveState;
  idleLabel: string;
  savingLabel: string;
  savedLabel: string;
  measureLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  onClick: () => void;
}) {
  const states = [
    {
      key: "idle" as const,
      label: idleLabel,
      icon: <Save className="size-4" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
    {
      key: "saving" as const,
      label: savingLabel,
      icon: <LoaderCircle className="size-4 animate-spin" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
    {
      key: "saved" as const,
      label: savedLabel,
      icon: <Check className="size-4" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
  ];

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      className={cn(
        "relative justify-center overflow-hidden transition-[background-color,border-color,color,box-shadow] duration-300",
        state === "saved" &&
          !variant &&
          "bg-emerald-600 text-white hover:bg-emerald-600",
        state === "saved" &&
          variant === "outline" &&
          "border-emerald-500/50 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/12",
      )}
    >
      <span className="pointer-events-none invisible inline-flex items-center gap-2">
        <Save className="size-4" />
        {measureLabel}
      </span>

      {states.map((item) => {
        const active = state === item.key;
        return (
          <span
            key={item.key}
            className={cn(
              "pointer-events-none absolute inset-0 inline-flex items-center justify-center gap-2 transition-all duration-250",
              active ? item.className : "translate-y-1 scale-95 opacity-0",
            )}
          >
            {item.icon}
            {item.label}
          </span>
        );
      })}
    </Button>
  );
}

function Field({
  label,
  labelAccessory,
  className,
  description,
  error = false,
  children,
}: {
  label: string;
  labelAccessory?: React.ReactNode;
  className?: string;
  description?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label
          className={cn(
            "text-xs font-semibold text-muted-foreground",
            error && "text-destructive",
          )}
        >
          {label}
        </Label>
        {labelAccessory}
      </div>
      {children}
      {description ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            error && "text-destructive",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
