"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  Textarea,
  cn,
  toastManager,
} from "@workspace/ui";

import {
  fsApi,
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

type RoutingDraft = {
  default_provider: string | null;
  features: LlmFeatureBindings;
};

type ModalDraftState = {
  version: number;
  providers: ProviderDraft[];
  routing: RoutingDraft;
};

type SaveState = "idle" | "saving" | "saved";

const EMPTY_CONFIG: LlmProvidersFile = {
  version: 1,
  default_provider: null,
  features: {},
  providers: {},
};

const EMPTY_ROUTING: RoutingDraft = {
  default_provider: null,
  features: {},
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
const DEFAULT_GIT_COMMIT_PROMPT = `You generate high-signal Git commit messages using the Conventional Commits format.

Analyze the repository change summary and infer the dominant change. Prefer the
most meaningful user-facing, architectural, or maintenance change. When changes
are mixed, pick the clearest umbrella change instead of listing everything.

Return a complete commit message in this format:

<type>[optional scope]: <description>

<body>

[optional footer]

Requirements:
- Use a valid conventional commit type
- Keep the first line under 72 characters
- Use imperative mood
- The body is required unless the change is truly trivial
- The body should explain what changed and why it matters
- Mention the concrete feature, area, or module that changed
- Do not use bullets, code fences, quotes, or commentary outside the commit
- Do not mention that the message was generated

Allowed types:
- feat: new feature or user-visible enhancement
- fix: bug fix or regression fix
- refactor: structural change without feature or bug behavior change
- perf: performance improvement
- docs: documentation-only change
- test: test-only change
- build: dependency or build tooling change
- ci: CI or automation pipeline change
- style: formatting or stylistic cleanup with no logic change
- chore: maintenance, housekeeping, or non-user-facing updates
- revert: revert a previous change

Scope guidance:
- Add a scope only when it improves clarity and stays concise
- Prefer concrete areas such as auth, landing, editor, git, api, ui, workspace
- Skip the scope if it makes the subject clunky or overly specific

Body guidance:
- Explain what changed and why, not implementation trivia
- Use one or two short paragraphs
- Wrap lines naturally at about 72 characters
- Contrast with previous behavior when that adds clarity
- If relevant, mention the most important files or surfaces affected

Decision rules:
- Prefer what changed over how it changed
- Prefer specific product or code-area names over vague words like update or changes
- Ignore local-only noise, caches, generated assets, and transient workspace metadata unless they are the main change
- If new files indicate a new section or feature, prefer that over incidental config or copy edits
- If most files are translations or copy edits, use docs or feat depending on product impact
- If the change is primarily restructuring existing code, use refactor

Good examples:

feat(landing): add problem-solution section

Introduce a dedicated problem-solution section on the landing page to clarify
the product pitch and improve narrative flow before the feature breakdown.

fix(editor): preserve selection after save

Keep the active selection stable after writes so editing feels predictable.
This avoids forcing users to manually restore cursor context on each save.`;

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
    .replace(/[^a-z0-9]+/g, "-")
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
    routing.default_provider,
    routing.features.session_title ?? null,
    routing.features.git_commit ?? null,
  ]) {
    if (selected && !clientKeys.has(selected)) {
      return "Routing references a provider that does not exist.";
    }
  }
  return null;
}

function fileToModalState(config: LlmProvidersFile): ModalDraftState {
  const providers = Object.entries(config.providers ?? {}).map(
    ([id, provider], index) => ({
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
    }),
  );

  const persistedToClientKey = new Map(
    providers.map((provider) => [provider.persistedId, provider.clientKey]),
  );

  return {
    version: config.version ?? 1,
    providers,
    routing: {
      default_provider: config.default_provider
        ? (persistedToClientKey.get(config.default_provider) ?? null)
        : null,
      features: {
        session_title: config.features?.session_title
          ? (persistedToClientKey.get(config.features.session_title) ?? null)
          : null,
        git_commit: config.features?.git_commit
          ? (persistedToClientKey.get(config.features.git_commit) ?? null)
          : null,
      },
    },
  };
}

function modalStateToFile(state: ModalDraftState): LlmProvidersFile {
  const providerIdMap = buildDraftIdMap(state.providers);

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
    {},
  );

  return {
    version: state.version || 1,
    default_provider: state.routing.default_provider
      ? (providerIdMap.get(state.routing.default_provider) ?? null)
      : null,
    features: {
      session_title: state.routing.features.session_title
        ? (providerIdMap.get(state.routing.features.session_title) ?? null)
        : null,
      git_commit: state.routing.features.git_commit
        ? (providerIdMap.get(state.routing.features.git_commit) ?? null)
        : null,
    },
    providers,
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
    timeout_ms: "8000",
    max_output_tokens: "",
  };
}

function gitCommitPromptPath(homeDir: string): string {
  return `${homeDir.replace(/\/$/, "")}/.atmos/llm/prompt/git-commit-prompt.md`;
}

export function LlmProvidersModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [version, setVersion] = useState(1);
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [routingDraft, setRoutingDraft] = useState<RoutingDraft>(EMPTY_ROUTING);
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(
    null,
  );
  const [providerEditor, setProviderEditor] = useState<ProviderDraft | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [routingSaveState, setRoutingSaveState] = useState<SaveState>("idle");
  const [providerSaveState, setProviderSaveState] = useState<SaveState>("idle");
  const [promptSaveState, setPromptSaveState] = useState<SaveState>("idle");
  const [providerNameTouched, setProviderNameTouched] = useState(false);
  const [providerSaveAttempted, setProviderSaveAttempted] = useState(false);
  const [routingExpanded, setRoutingExpanded] = useState(false);
  const [gitCommitPromptOpen, setGitCommitPromptOpen] = useState(false);
  const [gitCommitPromptPathValue, setGitCommitPromptPathValue] =
    useState<string>("");
  const [gitCommitPromptContent, setGitCommitPromptContent] = useState("");
  const [gitCommitPromptLoading, setGitCommitPromptLoading] = useState(false);
  const routingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const providerResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const promptResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const scheduleSaveStateReset = useCallback(
    (
      setState: React.Dispatch<React.SetStateAction<SaveState>>,
      timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    ) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setState("idle");
        timerRef.current = null;
      }, 3000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (routingResetTimerRef.current) {
        clearTimeout(routingResetTimerRef.current);
      }
      if (providerResetTimerRef.current) {
        clearTimeout(providerResetTimerRef.current);
      }
      if (promptResetTimerRef.current) {
        clearTimeout(promptResetTimerRef.current);
      }
    },
    [],
  );

  const loadConfig = useCallback(
    async (preferredPersistedId?: string | null) => {
      setLoading(true);
      try {
        const config = await llmProvidersApi.get();
        const nextState = fileToModalState(config);
        setVersion(nextState.version);
        setProviders(nextState.providers);
        setRoutingDraft(nextState.routing);

        const selected =
          (preferredPersistedId
            ? nextState.providers.find(
                (provider) => provider.persistedId === preferredPersistedId,
              )
            : null) ??
          nextState.providers[0] ??
          null;

        setSelectedProviderKey(selected?.clientKey ?? null);
        setProviderEditor(selected ? { ...selected } : null);
        setProviderNameTouched(false);
        setProviderSaveAttempted(false);
      } catch (error) {
        toastManager.add({
          title: "Failed to load LLM settings",
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setRoutingExpanded(false);
    void loadConfig();
  }, [open, loadConfig]);

  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        value: provider.clientKey,
        label: providerLabel(provider),
      })),
    [providers],
  );

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

  const selectProvider = (provider: ProviderDraft) => {
    setSelectedProviderKey(provider.clientKey);
    setProviderEditor({ ...provider });
    setProviderNameTouched(false);
    setProviderSaveAttempted(false);
  };

  const handleAddProvider = () => {
    const draft = newProviderDraft(providers);
    setSelectedProviderKey(draft.clientKey);
    setProviderEditor(draft);
    setProviderNameTouched(false);
    setProviderSaveAttempted(false);
  };

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
        modalStateToFile({
          version,
          providers,
          routing: routingDraft,
        }),
      );
      setRoutingSaveState("saved");
      scheduleSaveStateReset(setRoutingSaveState, routingResetTimerRef);
    } catch (error) {
      setRoutingSaveState("idle");
      toastManager.add({
        title: "Failed to save routing settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
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
    const nextPersistedId =
      buildDraftIdMap(nextProviders).get(providerEditor.clientKey) ?? null;

    setProviderSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile({
          version,
          providers: nextProviders,
          routing: routingDraft,
        }),
      );
      setProviderSaveState("saved");
      scheduleSaveStateReset(setProviderSaveState, providerResetTimerRef);
      await loadConfig(nextPersistedId);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to save provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const handleOpenGitCommitPrompt = async () => {
    setGitCommitPromptLoading(true);
    try {
      const homeDir = await fsApi.getHomeDir();
      const path = gitCommitPromptPath(homeDir);
      setGitCommitPromptPathValue(path);

      const response = await fsApi.readFile(path);
      if (response.exists) {
        setGitCommitPromptContent(
          response.content?.trim()
            ? response.content
            : DEFAULT_GIT_COMMIT_PROMPT,
        );
      } else {
        await fsApi.writeFile(path, `${DEFAULT_GIT_COMMIT_PROMPT}\n`);
        setGitCommitPromptContent(DEFAULT_GIT_COMMIT_PROMPT);
      }

      setGitCommitPromptOpen(true);
    } catch (error) {
      toastManager.add({
        title: "Failed to open prompt",
        description:
          error instanceof Error ? error.message : "Unknown filesystem error",
        type: "error",
      });
    } finally {
      setGitCommitPromptLoading(false);
    }
  };

  const handleSaveGitCommitPrompt = async () => {
    if (!gitCommitPromptPathValue) return;

    setPromptSaveState("saving");
    try {
      await fsApi.writeFile(
        gitCommitPromptPathValue,
        gitCommitPromptContent.trimEnd()
          ? `${gitCommitPromptContent.trimEnd()}\n`
          : `${DEFAULT_GIT_COMMIT_PROMPT}\n`,
      );
      setPromptSaveState("saved");
      scheduleSaveStateReset(setPromptSaveState, promptResetTimerRef);
    } catch (error) {
      setPromptSaveState("idle");
      toastManager.add({
        title: "Failed to save prompt",
        description:
          error instanceof Error ? error.message : "Unknown filesystem error",
        type: "error",
      });
    }
  };

  const handleDeleteProvider = async () => {
    if (!providerEditor) return;

    if (!providerEditor.persistedId) {
      const fallback = providers[0] ?? null;
      setSelectedProviderKey(fallback?.clientKey ?? null);
      setProviderEditor(fallback ? { ...fallback } : null);
      setProviderNameTouched(false);
      setProviderSaveAttempted(false);
      return;
    }

    const nextProviders = providers.filter(
      (provider) => provider.clientKey !== providerEditor.clientKey,
    );
    const nextRouting: RoutingDraft = {
      default_provider:
        routingDraft.default_provider === providerEditor.clientKey
          ? null
          : routingDraft.default_provider,
      features: {
        session_title:
          routingDraft.features.session_title === providerEditor.clientKey
            ? null
            : routingDraft.features.session_title,
        git_commit:
          routingDraft.features.git_commit === providerEditor.clientKey
            ? null
            : routingDraft.features.git_commit,
      },
    };

    setProviderSaveState("saving");
    try {
      await llmProvidersApi.update(
        modalStateToFile({
          version,
          providers: nextProviders,
          routing: nextRouting,
        }),
      );
      toastManager.add({ title: "Provider deleted", type: "success" });
      const nextPersistedId = nextProviders[0]?.persistedId ?? null;
      await loadConfig(nextPersistedId);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to delete provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      if (providerResetTimerRef.current) {
        clearTimeout(providerResetTimerRef.current);
        providerResetTimerRef.current = null;
      }
      setProviderSaveState("idle");
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
      <DialogContent className="grid h-[min(900px,calc(100vh-2.5rem))] w-[min(96vw,1280px)] max-h-[calc(100vh-2.5rem)] max-w-[min(96vw,1280px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:h-[min(900px,calc(100vh-4rem))] sm:max-h-[calc(100vh-4rem)] sm:max-w-[min(96vw,1280px)]">
        <div className="relative overflow-hidden rounded-t-xl border-b border-border bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.12),_transparent_40%),linear-gradient(135deg,_hsl(var(--muted)/0.9),_transparent)] px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[18px]">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm backdrop-blur">
                <BrainCircuit className="size-4 text-primary" />
              </div>
              Lightweight AI Providers
            </DialogTitle>
            <DialogDescription className="max-w-2xl">
              Configure optional providers for short background tasks. such as
              ACP session title or git commit generation.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid min-h-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-border bg-muted/20 lg:border-b-0 lg:border-r">
            <ScrollArea className="h-full">
              <div className="space-y-5 px-5 py-2">
                <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Providers
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Select a saved provider to edit it, or add a new one.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {providers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                        No saved providers yet.
                      </div>
                    ) : (
                      providers.map((provider) => (
                        <button
                          key={provider.clientKey}
                          type="button"
                          onClick={() => selectProvider(provider)}
                          className={cn(
                            "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                            selectedProviderKey === provider.clientKey
                              ? "border-primary/40 bg-primary/10"
                              : "border-border bg-background hover:bg-accent/40",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {providerLabel(provider)}
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {provider.persistedId}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]",
                                provider.enabled
                                  ? "border-emerald-500/30 text-emerald-400"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {provider.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="mt-4 w-full justify-start gap-2"
                    onClick={handleAddProvider}
                  >
                    <Plus className="size-4" />
                    Add provider
                  </Button>
                </div>

                <Collapsible
                  open={routingExpanded}
                  onOpenChange={setRoutingExpanded}
                  className="rounded-2xl border border-border bg-background/80 shadow-sm"
                >
                  <CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 p-4 text-left">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Routing
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Choose which provider powers each lightweight task.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                      {routingExpanded ? "Collapse" : "Expand"}
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform duration-200",
                          routingExpanded && "rotate-180",
                        )}
                      />
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t border-border px-4 pb-4">
                      <div className="mt-4 space-y-4">
                        <FeatureSelect
                          label="Default provider"
                          value={routingDraft.default_provider}
                          providerOptions={providerOptions}
                          noneLabel="None"
                          onChange={(value) =>
                            setRoutingDraft((current) => ({
                              ...current,
                              default_provider: value,
                            }))
                          }
                        />

                        <FeatureSelect
                          label="Session title generator"
                          value={routingDraft.features.session_title}
                          providerOptions={providerOptions}
                          noneLabel="Disabled"
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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={handleOpenGitCommitPrompt}
                              disabled={gitCommitPromptLoading}
                            >
                              {gitCommitPromptLoading ? "Opening..." : "Prompt"}
                            </Button>
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
                      </div>

                      <div className="mt-4 flex justify-end">
                        <SaveStateButton
                          state={routingSaveState}
                          idleLabel="Save routing"
                          savingLabel="Saving..."
                          savedLabel="Saved"
                          onClick={handleSaveRouting}
                          disabled={routingSaveState === "saving"}
                          variant="outline"
                          measureLabel="Save routing"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </ScrollArea>
          </div>

          <div className="min-h-0 min-w-0 bg-background">
            <ScrollArea className="h-full">
              <div className="px-5 py-2">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-sm text-muted-foreground">
                    Loading local LLM settings...
                  </div>
                ) : providerEditor ? (
                  <section className="rounded-3xl border border-border bg-[linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.18))] p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Provider
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-foreground">
                          {providerLabel(providerEditor) || "New provider"}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedProviderHint ??
                            "Configure and save a lightweight provider"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
                          <span className="text-xs text-muted-foreground">
                            Enabled
                          </span>
                          <Switch
                            checked={providerEditor.enabled}
                            onCheckedChange={(checked) =>
                              setProviderEditor((current) =>
                                current
                                  ? { ...current, enabled: checked }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={handleDeleteProvider}
                          disabled={providerSaveState === "saving"}
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
                          value={providerEditor.name}
                          onChange={(event) => {
                            setProviderNameTouched(true);
                            setProviderEditor((current) =>
                              current
                                ? { ...current, name: event.target.value }
                                : current,
                            );
                          }}
                          placeholder="OpenRouter Fast"
                          className={cn(
                            showProviderNameIssue &&
                              "border-destructive focus-visible:ring-destructive/30",
                          )}
                        />
                      </Field>

                      <Field
                        label="Provider key"
                        description={
                          providerEditor.name.trim()
                            ? slugifyProviderId(providerEditor.name) ||
                              "Will be generated from the provider name"
                            : "Will be generated from the provider name"
                        }
                      >
                        <Input
                          value={
                            providerEditor.name.trim()
                              ? slugifyProviderId(providerEditor.name)
                              : ""
                          }
                          placeholder="auto-generated"
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
                                    max_output_tokens:
                                      shouldSeedAnthropicDefault
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
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label="Timeout (ms)">
                        <Input
                          value={providerEditor.timeout_ms}
                          onChange={(event) =>
                            setProviderEditor((current) =>
                              current
                                ? { ...current, timeout_ms: event.target.value }
                                : current,
                            )
                          }
                          placeholder="8000"
                        />
                      </Field>

                      <Field label="Max output tokens">
                        <Input
                          value={providerEditor.max_output_tokens}
                          onChange={(event) =>
                            setProviderEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    max_output_tokens: event.target.value,
                                  }
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
                              current
                                ? { ...current, base_url: event.target.value }
                                : current,
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
                              current
                                ? { ...current, api_key: event.target.value }
                                : current,
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
                              current
                                ? { ...current, model: event.target.value }
                                : current,
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

                    <div className="mt-6 flex justify-end">
                      <SaveStateButton
                        state={providerSaveState}
                        idleLabel="Save provider"
                        savingLabel="Saving..."
                        savedLabel="Saved"
                        onClick={handleSaveProvider}
                        disabled={providerSaveState === "saving"}
                        measureLabel="Save provider"
                      />
                    </div>
                  </section>
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-border bg-[linear-gradient(135deg,_hsl(var(--muted)/0.6),_transparent)] p-10 text-center">
                    <div className="flex max-w-sm flex-col items-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-background/80 shadow-sm">
                        <BrainCircuit className="size-5 text-primary" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">
                        Select a provider
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose a saved provider from the list, or add a new one
                        to configure it.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>

      <Dialog open={gitCommitPromptOpen} onOpenChange={setGitCommitPromptOpen}>
        <DialogContent className="w-[min(92vw,860px)] max-w-[860px] border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Edit Git Commit Prompt</DialogTitle>
            <DialogDescription>
              This prompt is read from{" "}
              <span className="font-mono text-[12px] text-foreground/80">
                {gitCommitPromptPathValue ||
                  "~/.atmos/llm/prompt/git-commit-prompt.md"}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            <Textarea
              value={gitCommitPromptContent}
              onChange={(event) =>
                setGitCommitPromptContent(event.target.value)
              }
              className="min-h-[380px] resize-y rounded-xl border-border bg-background/70 font-mono text-[13px] leading-6"
              placeholder="Write the system prompt used for git commit message generation."
            />
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              onClick={() => setGitCommitPromptOpen(false)}
            >
              Close
            </Button>
            <SaveStateButton
              state={promptSaveState}
              idleLabel="Save prompt"
              savingLabel="Saving..."
              savedLabel="Saved"
              onClick={handleSaveGitCommitPrompt}
              disabled={promptSaveState === "saving"}
              measureLabel="Save prompt"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
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
        "relative min-w-[9.5rem] justify-center overflow-hidden transition-[background-color,border-color,color,box-shadow] duration-300",
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
          error && "text-destructive",
        )}
      >
        {label}
      </Label>
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
