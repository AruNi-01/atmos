"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Plus, Save, Trash2 } from "lucide-react";
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
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
} from "@/api/ws-api";

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

type DraftState = {
  version: number;
  default_provider: string | null;
  features: LlmFeatureBindings;
  providers: ProviderDraft[];
};

const EMPTY_CONFIG: LlmProvidersFile = {
  version: 1,
  default_provider: null,
  features: {},
  providers: {},
};

const KIND_OPTIONS: Array<{ value: LlmProviderKind; label: string; hint: string }> = [
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

function defaultMaxOutputTokens(kind: LlmProviderKind): string {
  return kind === "anthropic-compatible" ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS : "";
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
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
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
    const baseId = slugifyProviderId(provider.name) || provider.persistedId.trim();
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

function buildProviderNameIssues(providers: ProviderDraft[]): Record<string, string | null> {
  const nextIds = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const provider of providers) {
    const name = provider.name.trim();
    if (!name) continue;
    const generatedId = slugifyProviderId(name);
    if (!generatedId) continue;
    if ([...nextIds.values()].includes(generatedId)) {
      duplicates.add(generatedId);
    } else {
      nextIds.set(provider.clientKey, generatedId);
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
        return [provider.clientKey, "Provider name must contain letters or numbers."];
      }
      if (duplicates.has(generatedId)) {
        return [provider.clientKey, "Provider name is duplicated."];
      }
      return [provider.clientKey, null];
    })
  );
}

function fileToDraft(config: LlmProvidersFile): DraftState {
  const providers = Object.entries(config.providers ?? {}).map(([id, provider], index) => ({
    clientKey: `provider-${index + 1}-${id}`,
    persistedId: id,
    enabled: provider.enabled,
    name: provider.displayName ?? fallbackProviderName(id),
    kind: provider.kind,
    base_url: provider.base_url ?? "",
    api_key: provider.api_key ?? "",
    model: provider.model ?? "",
    timeout_ms: provider.timeout_ms == null ? "" : String(provider.timeout_ms),
    max_output_tokens:
      provider.max_output_tokens == null
        ? defaultMaxOutputTokens(provider.kind)
        : String(provider.max_output_tokens),
  }));
  const persistedToClientKey = new Map(
    providers.map((provider) => [provider.persistedId, provider.clientKey])
  );

  return {
    version: config.version ?? 1,
    default_provider: config.default_provider
      ? persistedToClientKey.get(config.default_provider) ?? null
      : null,
    features: {
      session_title: config.features?.session_title
        ? persistedToClientKey.get(config.features.session_title) ?? null
        : null,
      git_commit: config.features?.git_commit
        ? persistedToClientKey.get(config.features.git_commit) ?? null
        : null,
    },
    providers,
  };
}

function draftToFile(draft: DraftState): LlmProvidersFile {
  const providerIdMap = buildDraftIdMap(draft.providers);
  const providers = draft.providers.reduce<Record<string, LlmProviderEntry>>((acc, provider) => {
    const trimmedTimeout = provider.timeout_ms.trim();
    const trimmedMaxOutputTokens = provider.max_output_tokens.trim();
    const providerId = providerIdMap.get(provider.clientKey);
    if (!providerId) {
      return acc;
    }
    acc[providerId] = {
      enabled: provider.enabled,
      displayName: provider.name.trim() || null,
      kind: provider.kind,
      base_url: provider.base_url.trim(),
      api_key: provider.api_key.trim(),
      model: provider.model.trim(),
      timeout_ms: trimmedTimeout ? parseInt(trimmedTimeout, 10) : null,
      max_output_tokens: trimmedMaxOutputTokens ? parseInt(trimmedMaxOutputTokens, 10) : null,
    };
    return acc;
  }, {});

  return {
    version: draft.version || 1,
    default_provider: draft.default_provider
      ? providerIdMap.get(draft.default_provider) ?? null
      : null,
    features: {
      session_title: draft.features.session_title
        ? providerIdMap.get(draft.features.session_title) ?? null
        : null,
      git_commit: draft.features.git_commit
        ? providerIdMap.get(draft.features.git_commit) ?? null
        : null,
    },
    providers,
  };
}

function providerLabel(provider: ProviderDraft): string {
  return provider.name.trim() || provider.persistedId;
}

function validateDraft(draft: DraftState): string | null {
  const nameIssues = buildProviderNameIssues(draft.providers);
  const clientKeys = new Set<string>();
  for (const provider of draft.providers) {
    const issue = nameIssues[provider.clientKey];
    if (issue) return issue;
    if (clientKeys.has(provider.clientKey)) return "Duplicate provider entry detected.";
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
    clientKeys.add(provider.clientKey);
  }
  for (const selected of [
    draft.default_provider,
    draft.features.session_title ?? null,
    draft.features.git_commit ?? null,
  ]) {
    if (selected && !clientKeys.has(selected)) {
      return `Selected provider "${selected}" no longer exists.`;
    }
  }
  return null;
}

function featureSelectValue(value?: string | null): string {
  return value || "__none__";
}

export function LlmProvidersModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<DraftState>(fileToDraft(EMPTY_CONFIG));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touchedProviderNames, setTouchedProviderNames] = useState<Set<string>>(new Set());
  const [saveAttempted, setSaveAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTouchedProviderNames(new Set());
    setSaveAttempted(false);
    llmProvidersApi
      .get()
      .then((config) => setDraft(fileToDraft(config)))
      .catch((error) => {
        toastManager.add({
          title: "Failed to load LLM settings",
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      })
      .finally(() => setLoading(false));
  }, [open]);

  const providerOptions = useMemo(
    () =>
      draft.providers.map((provider) => ({
        value: provider.clientKey,
        label: providerLabel(provider),
      })),
    [draft.providers]
  );
  const providerNameIssues = useMemo(
    () => buildProviderNameIssues(draft.providers),
    [draft.providers]
  );

  const updateProvider = (index: number, patch: Partial<ProviderDraft>) => {
    setDraft((current) => ({
      ...current,
      providers: current.providers.map((provider, providerIndex) =>
        providerIndex === index ? { ...provider, ...patch } : provider
      ),
    }));
  };

  const removeProvider = (index: number) => {
    const removedId = draft.providers[index]?.clientKey ?? null;
    setDraft((current) => {
      const clearIfRemoved = (value?: string | null) =>
        value === removedId ? null : value ?? null;
      return {
        ...current,
        providers: current.providers.filter((_, providerIndex) => providerIndex !== index),
        default_provider: clearIfRemoved(current.default_provider),
        features: {
          session_title: clearIfRemoved(current.features.session_title),
          git_commit: clearIfRemoved(current.features.git_commit),
        },
      };
    });
    setTouchedProviderNames((current) => {
      const next = new Set(current);
      if (removedId) {
        next.delete(removedId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaveAttempted(true);
    const validationError = validateDraft(draft);
    if (validationError) {
      toastManager.add({
        title: "Invalid LLM settings",
        description: validationError,
        type: "error",
      });
      return;
    }

    setSaving(true);
    try {
      await llmProvidersApi.update(draftToFile(draft));
      toastManager.add({ title: "LLM settings saved", type: "success" });
      setSaveAttempted(false);
      onOpenChange(false);
    } catch (error) {
      toastManager.add({
        title: "Failed to save LLM settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]">
        <div className="relative overflow-hidden rounded-t-xl border-b border-border bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.12),_transparent_40%),linear-gradient(135deg,_hsl(var(--muted)/0.9),_transparent)] px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[18px]">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm backdrop-blur">
                <BrainCircuit className="size-4 text-primary" />
              </div>
              Lightweight AI Providers
            </DialogTitle>
            <DialogDescription className="max-w-2xl">
              Configure optional providers for short background tasks such as ACP session titles and git commit generation.
              Settings are stored locally in <code>~/.atmos/llm/providers.json</code>.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-border bg-muted/20 p-5 lg:border-b-0 lg:border-r">
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Routing
                </p>
                <div className="mt-4 space-y-4">
                  <FeatureSelect
                    label="Default provider"
                    value={draft.default_provider}
                    providerOptions={providerOptions}
                    noneLabel="None"
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        default_provider: value,
                      }))
                    }
                  />

                  <FeatureSelect
                    label="Session title generator"
                    value={draft.features.session_title}
                    providerOptions={providerOptions}
                    noneLabel="Disabled"
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        features: { ...current.features, session_title: value },
                      }))
                    }
                  />

                  <FeatureSelect
                    label="Git commit generator"
                    value={draft.features.git_commit}
                    providerOptions={providerOptions}
                    noneLabel="Disabled"
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        features: { ...current.features, git_commit: value },
                      }))
                    }
                  />
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    providers: [
                      ...current.providers,
                      {
                        clientKey: nextProviderClientKey(current.providers),
                        persistedId: "",
                        enabled: true,
                        name: "",
                        kind: "openai-compatible",
                        base_url: "",
                        api_key: "",
                        model: "",
                        timeout_ms: "8000",
                        max_output_tokens: "",
                      },
                    ],
                  }));
                }}
              >
                <Plus className="size-4" />
                Add provider
              </Button>
            </div>
          </div>

          <div className="min-w-0 bg-background">
            <ScrollArea className="h-[68vh]">
              <div className="space-y-4 p-5">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-sm text-muted-foreground">
                    Loading local LLM settings...
                  </div>
                ) : draft.providers.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-border bg-[linear-gradient(135deg,_hsl(var(--muted)/0.6),_transparent)] p-10 text-center">
                    <div className="flex max-w-sm flex-col items-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-background/80 shadow-sm">
                        <BrainCircuit className="size-5 text-primary" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">No lightweight provider configured</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Add one to enable optional AI-powered session titles and short-form generation.
                      </p>
                    </div>
                  </div>
                ) : (
                  draft.providers.map((provider, index) => {
                    const kindMeta = KIND_OPTIONS.find((item) => item.value === provider.kind);
                    const providerNameIssue = providerNameIssues[provider.clientKey];
                    const showProviderNameIssue =
                      !!providerNameIssue &&
                      (saveAttempted || touchedProviderNames.has(provider.clientKey));
                    return (
                      <section
                        key={provider.clientKey}
                        className="rounded-3xl border border-border bg-[linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.18))] p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              Provider
                            </p>
                            <h3 className="mt-1 text-lg font-semibold text-foreground">
                              {providerLabel(provider)}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {kindMeta?.hint ?? "Compatible provider endpoint"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
                              <span className="text-xs text-muted-foreground">Enabled</span>
                              <Switch
                                checked={provider.enabled}
                                onCheckedChange={(checked) => updateProvider(index, { enabled: checked })}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => removeProvider(index)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <Field
                            label="Provider name"
                            description={
                              showProviderNameIssue && providerNameIssue
                                ? providerNameIssue
                                : "Used to generate the internal provider key automatically."
                            }
                            error={showProviderNameIssue}
                          >
                            <Input
                              value={provider.name}
                              onChange={(event) => {
                                setTouchedProviderNames((current) => {
                                  const next = new Set(current);
                                  next.add(provider.clientKey);
                                  return next;
                                });
                                updateProvider(index, { name: event.target.value });
                              }}
                              placeholder="OpenRouter Fast"
                              className={cn(
                                showProviderNameIssue &&
                                  "border-destructive focus-visible:ring-destructive/30"
                              )}
                            />
                          </Field>
                          <Field
                            label="Provider key"
                            description={
                              provider.name.trim()
                                ? slugifyProviderId(provider.name) || "Will be generated from the provider name"
                                : "Will be generated from the provider name"
                            }
                          >
                            <Input
                              value={provider.name.trim() ? slugifyProviderId(provider.name) : ""}
                              placeholder="auto-generated"
                              disabled
                            />
                          </Field>
                          <Field label="Compatibility">
                            <Select
                              value={provider.kind}
                              onValueChange={(value) => {
                                const kind = value as LlmProviderKind;
                                const shouldSeedAnthropicDefault =
                                  !provider.max_output_tokens.trim() &&
                                  kind === "anthropic-compatible";
                                updateProvider(index, {
                                  kind,
                                  max_output_tokens: shouldSeedAnthropicDefault
                                    ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
                                    : provider.max_output_tokens,
                                });
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
                          <Field label="Timeout (ms)">
                            <Input
                              value={provider.timeout_ms}
                              onChange={(event) =>
                                updateProvider(index, { timeout_ms: event.target.value })
                              }
                              placeholder="8000"
                            />
                          </Field>
                          <Field label="Max output tokens">
                            <Input
                              value={provider.max_output_tokens}
                              onChange={(event) =>
                                updateProvider(index, { max_output_tokens: event.target.value })
                              }
                              placeholder={
                                provider.kind === "anthropic-compatible"
                                  ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
                                  : "Optional"
                              }
                            />
                          </Field>
                          <Field label="Base URL" className="md:col-span-2">
                            <Input
                              value={provider.base_url}
                              onChange={(event) =>
                                updateProvider(index, { base_url: event.target.value })
                              }
                              placeholder={
                                provider.kind === "anthropic-compatible"
                                  ? "https://api.anthropic.com"
                                  : "https://openrouter.ai/api/v1"
                              }
                            />
                          </Field>
                          <Field label="API key" className="md:col-span-2">
                            <Input
                              type="password"
                              value={provider.api_key}
                              onChange={(event) =>
                                updateProvider(index, { api_key: event.target.value })
                              }
                              placeholder="sk-... or env:OPENROUTER_API_KEY"
                            />
                          </Field>
                          <Field label="Model" className="md:col-span-2">
                            <Input
                              value={provider.model}
                              onChange={(event) =>
                                updateProvider(index, { model: event.target.value })
                              }
                              placeholder={
                                provider.kind === "anthropic-compatible"
                                  ? "claude-3-5-haiku-latest"
                                  : "openrouter/auto"
                              }
                            />
                          </Field>
                        </div>
                      </section>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/15 px-6 py-4">
          <div className="mr-auto text-xs text-muted-foreground">
            Unconfigured or failing providers automatically fall back to the built-in heuristic title generator.
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className={cn("size-4", saving && "animate-pulse")} />
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureSelect({
  label,
  value,
  providerOptions,
  noneLabel,
  onChange,
}: {
  label: string;
  value?: string | null;
  providerOptions: Array<{ value: string; label: string }>;
  noneLabel: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
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

function Field({
  label,
  className,
  description,
  error = false,
  children,
}: {
  label: string;
  className?: string;
  description?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground",
          error && "text-destructive"
        )}
      >
        {label}
      </Label>
      {children}
      {description ? (
        <p className={cn("text-xs text-muted-foreground", error && "text-destructive")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
