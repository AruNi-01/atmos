"use client";

import React from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from "@workspace/ui";
import {
  Building2,
  ChevronDown,
  House,
  Languages,
  Route,
  SlidersHorizontal,
} from "lucide-react";

import {
  FEATURE_LANGUAGE_OPTIONS,
  fallbackProviderLabel,
  normalizeSessionTitleFormat,
  sessionTitleFormatPreview,
} from "@/features/settings/components/settings/settings-modal-utils";
import { LocalModelPanel, LocalModelRuntimeControl } from "@/features/settings/components/LocalModelPanel";
import type { LlmProvidersFile } from "@/api/ws-api";

export type ProviderTestState = Record<string, {
  open: boolean;
  status: "idle" | "testing" | "pass" | "fail";
  output: string;
}>;

type SettingsAiSectionProps = {
  handleLlmConfigUpdate: (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => Promise<void>;
  handleProviderEnabledChange: (providerId: string, enabled: boolean) => Promise<void>;
  isLlmConfigLoading: boolean;
  llmConfig: LlmProvidersFile | null;
  loadLlmConfig: () => Promise<void>;
  providerTests: ProviderTestState;
  providerToggleId: string | null;
  providersExpanded: boolean;
  routingExpanded: boolean;
  routingSavingKey: string | null;
  runProviderTest: (
    providerId: string,
    provider: NonNullable<LlmProvidersFile["providers"][string]>,
  ) => Promise<void>;
  sessionTitleFormatOpen: boolean;
  setProviderDialogState: React.Dispatch<React.SetStateAction<{
    open: boolean;
    providerId: string | null;
  }>>;
  setProviderTests: React.Dispatch<React.SetStateAction<ProviderTestState>>;
  setProvidersExpanded: (open: boolean) => void;
  setRoutingExpanded: (open: boolean) => void;
  setSessionTitleFormatOpen: (open: boolean) => void;
};

export function SettingsAiSection({
  handleLlmConfigUpdate,
  handleProviderEnabledChange,
  isLlmConfigLoading,
  llmConfig,
  loadLlmConfig,
  providerTests,
  providerToggleId,
  providersExpanded,
  routingExpanded,
  routingSavingKey,
  runProviderTest,
  sessionTitleFormatOpen,
  setProviderDialogState,
  setProviderTests,
  setProvidersExpanded,
  setRoutingExpanded,
  setSessionTitleFormatOpen,
}: SettingsAiSectionProps) {
  const providerEntries = React.useMemo(
    () =>
      Object.entries(llmConfig?.providers ?? {}).map(([id, provider]) => ({
        id,
        label: provider.displayName?.trim() || fallbackProviderLabel(id),
        enabled: provider.enabled,
        model: provider.model?.trim() || null,
        kind: provider.kind,
      })),
    [llmConfig],
  );
  const sessionTitleFormat = React.useMemo(
    () => normalizeSessionTitleFormat(llmConfig?.features?.session_title_format),
    [llmConfig],
  );

  return (
    <div className="space-y-4">
      <Collapsible
        open={providersExpanded}
        onOpenChange={setProvidersExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Building2 className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Providers</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Manage API keys, endpoints, and default models for lightweight background tasks.
              </p>
            </div>
          </CollapsibleTrigger>
          <div className="flex items-center justify-end gap-3">
            {isLlmConfigLoading ? (
              <Skeleton className="h-10 w-28 rounded-xl" />
            ) : (
              <Button
                variant="outline"
                onClick={() => setProviderDialogState({ open: true, providerId: null })}
              >
                Add Provider
              </Button>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-6 py-3">
            {isLlmConfigLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : providerEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                No providers configured yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {providerEntries.map((provider) => (
                  <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {provider.label}
                        </p>
                        <Popover
                          open={providerTests[provider.id]?.open ?? false}
                          onOpenChange={(open) =>
                            setProviderTests((current) => ({
                              ...current,
                              [provider.id]: {
                                open,
                                status: current[provider.id]?.status ?? "idle",
                                output: current[provider.id]?.output ?? "",
                              },
                            }))
                          }
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-7 px-2 text-[11px]",
                                providerTests[provider.id]?.status === "pass" &&
                                  "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300",
                                providerTests[provider.id]?.status === "fail" &&
                                  "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15",
                                providerTests[provider.id]?.status === "testing" &&
                                  "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
                              )}
                              onClick={() => {
                                if (!llmConfig?.providers?.[provider.id]) return;
                                void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                              }}
                            >
                              {providerTests[provider.id]?.status === "testing"
                                ? "TESTING..."
                                : providerTests[provider.id]?.status === "pass"
                                  ? "PASS"
                                  : providerTests[provider.id]?.status === "fail"
                                    ? "FAIL"
                                    : "TEST"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[420px] p-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-foreground">
                                  Provider Test
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    if (!llmConfig?.providers?.[provider.id]) return;
                                    void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                                  }}
                                >
                                  RETEST
                                </Button>
                              </div>
                              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                                {providerTests[provider.id]?.output ||
                                  (providerTests[provider.id]?.status === "testing"
                                    ? "Streaming response..."
                                    : "Click TEST to start.")}
                              </pre>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {provider.kind === "local-managed" ? "Managed local model" : (provider.model || provider.kind)}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Enabled</span>
                        <Switch
                          checked={provider.enabled}
                          disabled={providerToggleId === provider.id}
                          onCheckedChange={(checked) => {
                            void handleProviderEnabledChange(provider.id, !!checked);
                          }}
                        />
                      </div>
                      {provider.kind !== "local-managed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setProviderDialogState({ open: true, providerId: provider.id })
                          }
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={routingExpanded}
        onOpenChange={setRoutingExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Route className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Routing</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose which provider handles tasks.
              </p>
            </div>
          </CollapsibleTrigger>
          <div />
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-6 py-3">
            {isLlmConfigLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Session title generator</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sessionTitleFormat.include_agent_name ||
                      sessionTitleFormat.include_project_name ||
                      sessionTitleFormat.include_intent_emoji
                        ? "Custom title format enabled"
                        : "Default title format"}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Select
                      value={llmConfig?.features?.session_title ?? "__none__"}
                      onValueChange={(value) => {
                        void handleLlmConfigUpdate("session_title", (current) => ({
                          ...current,
                          features: {
                            ...current.features,
                            session_title: value === "__none__" ? null : value,
                          },
                        }));
                      }}
                      disabled={routingSavingKey === "session_title"}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Disabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Disabled</SelectItem>
                        {providerEntries.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Popover open={sessionTitleFormatOpen} onOpenChange={setSessionTitleFormatOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <SlidersHorizontal className="size-4" />
                          Format
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 space-y-4 p-4">
                        <p className="text-sm font-medium text-foreground">Session title format</p>
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Final format
                          </p>
                          <p className="mt-2 font-mono text-sm text-foreground">
                            {sessionTitleFormatPreview(sessionTitleFormat)}
                          </p>
                        </div>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                          <div>
                            <p className="text-sm text-foreground">Intent emoji</p>
                          </div>
                          <Switch
                            checked={!!sessionTitleFormat.include_intent_emoji}
                            onCheckedChange={(checked) => {
                              void handleLlmConfigUpdate("session_title_format", (current) => ({
                                ...current,
                                features: {
                                  ...current.features,
                                  session_title_format: {
                                    ...normalizeSessionTitleFormat(current.features.session_title_format),
                                    include_intent_emoji: !!checked,
                                  },
                                },
                              }));
                            }}
                            disabled={routingSavingKey === "session_title_format"}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                          <div>
                            <p className="text-sm text-foreground">Agent name</p>
                          </div>
                          <Switch
                            checked={!!sessionTitleFormat.include_agent_name}
                            onCheckedChange={(checked) => {
                              void handleLlmConfigUpdate("session_title_format", (current) => ({
                                ...current,
                                features: {
                                  ...current.features,
                                  session_title_format: {
                                    ...normalizeSessionTitleFormat(current.features.session_title_format),
                                    include_agent_name: !!checked,
                                  },
                                },
                              }));
                            }}
                            disabled={routingSavingKey === "session_title_format"}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                          <div>
                            <p className="text-sm text-foreground">Project name</p>
                          </div>
                          <Switch
                            checked={!!sessionTitleFormat.include_project_name}
                            onCheckedChange={(checked) => {
                              void handleLlmConfigUpdate("session_title_format", (current) => ({
                                ...current,
                                features: {
                                  ...current.features,
                                  session_title_format: {
                                    ...normalizeSessionTitleFormat(current.features.session_title_format),
                                    include_project_name: !!checked,
                                  },
                                },
                              }));
                            }}
                            disabled={routingSavingKey === "session_title_format"}
                          />
                        </label>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Git commit generator</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {llmConfig?.features?.git_commit_language?.trim() || "Prompt default language"}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Select
                      value={llmConfig?.features?.git_commit ?? "__none__"}
                      onValueChange={(value) => {
                        void handleLlmConfigUpdate("git_commit", (current) => ({
                          ...current,
                          features: {
                            ...current.features,
                            git_commit: value === "__none__" ? null : value,
                          },
                        }));
                      }}
                      disabled={routingSavingKey === "git_commit"}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Disabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Disabled</SelectItem>
                        {providerEntries.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Languages className="size-4" />
                          Language
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem
                          onClick={() => {
                            void handleLlmConfigUpdate("git_commit_language", (current) => ({
                              ...current,
                              features: {
                                ...current.features,
                                git_commit_language: null,
                              },
                            }));
                          }}
                        >
                          Prompt default
                        </DropdownMenuItem>
                        {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => {
                              void handleLlmConfigUpdate("git_commit_language", (current) => ({
                                ...current,
                                features: {
                                  ...current.features,
                                  git_commit_language: option.label,
                                },
                              }));
                            }}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Workspace issue TODO extraction</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {llmConfig?.features?.workspace_issue_todo_language?.trim() || "Prompt default language"}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Select
                      value={llmConfig?.features?.workspace_issue_todo ?? "__none__"}
                      onValueChange={(value) => {
                        void handleLlmConfigUpdate("workspace_issue_todo", (current) => ({
                          ...current,
                          features: {
                            ...current.features,
                            workspace_issue_todo: value === "__none__" ? null : value,
                          },
                        }));
                      }}
                      disabled={routingSavingKey === "workspace_issue_todo"}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Disabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Disabled</SelectItem>
                        {providerEntries.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Languages className="size-4" />
                          Language
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem
                          onClick={() => {
                            void handleLlmConfigUpdate("workspace_issue_todo_language", (current) => ({
                              ...current,
                              features: {
                                ...current.features,
                                workspace_issue_todo_language: null,
                              },
                            }));
                          }}
                        >
                          Prompt default
                        </DropdownMenuItem>
                        {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => {
                              void handleLlmConfigUpdate("workspace_issue_todo_language", (current) => ({
                                ...current,
                                features: {
                                  ...current.features,
                                  workspace_issue_todo_language: option.label,
                                },
                              }));
                            }}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        defaultOpen
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
            <span className="relative mt-0.5 size-5 shrink-0">
              <House className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Local Model</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Run a small language model on-device - no API key required.
              </p>
            </div>
          </CollapsibleTrigger>
          <div className="flex items-start justify-end">
            <LocalModelRuntimeControl />
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-6 py-4">
            <LocalModelPanel onDownloadComplete={() => void loadLlmConfig()} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
