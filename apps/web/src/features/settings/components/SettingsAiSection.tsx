"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Switch,
  cn,
} from "@workspace/ui";
import { Languages } from "lucide-react";

import {
  FEATURE_LANGUAGE_OPTIONS,
  fallbackProviderLabel,
} from "@/features/settings/components/settings/settings-modal-utils";
import { LocalModelPanel, LocalModelRuntimeControl } from "@/features/settings/components/LocalModelPanel";
import type { LlmProvidersFile } from "@/api/ws-api";
import { FeatureSelect } from "@/app-shell/llm-providers-modal-parts";
import {
  agentCliRouteValue,
  parseAgentCliRouteValue,
  type LocalAgentOption,
} from "@/app-shell/llm-providers-modal-utils";
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from "@/features/settings/components/settings/SettingsGroupCard";

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
  localAgentOptions: readonly LocalAgentOption[];
  providerTests: ProviderTestState;
  providerToggleId: string | null;
  providersExpanded: boolean;
  routingExpanded: boolean;
  routingSavingKey: string | null;
  runProviderTest: (
    providerId: string,
    provider: NonNullable<LlmProvidersFile["providers"][string]>,
  ) => Promise<void>;
  setProviderDialogState: React.Dispatch<React.SetStateAction<{
    open: boolean;
    providerId: string | null;
  }>>;
  setProviderTests: React.Dispatch<React.SetStateAction<ProviderTestState>>;
  setProvidersExpanded: (open: boolean) => void;
  setRoutingExpanded: (open: boolean) => void;
};

export function SettingsAiSection({
  handleLlmConfigUpdate,
  handleProviderEnabledChange,
  isLlmConfigLoading,
  llmConfig,
  loadLlmConfig,
  localAgentOptions,
  providerTests,
  providerToggleId,
  providersExpanded,
  routingExpanded,
  routingSavingKey,
  runProviderTest,
  setProviderDialogState,
  setProviderTests,
  setProvidersExpanded,
  setRoutingExpanded,
}: SettingsAiSectionProps) {
  const t = useTranslations("settings.aiSection" as never);
  const tr = React.useCallback(
    (key: string, fallback: string) =>
      t.has(key as never) ? t(key as never) : fallback,
    [t],
  );
  const providerEntries = React.useMemo(
    () =>
      Object.entries(llmConfig?.providers ?? {})
        .filter(([, provider]) => provider.kind !== "agent-cli")
        .map(([id, provider]) => ({
          id,
          label: provider.displayName?.trim() || fallbackProviderLabel(id),
          enabled: provider.enabled,
          model: provider.model?.trim() || null,
          kind: provider.kind,
        })),
    [llmConfig],
  );
  const providerOptions = React.useMemo(
    () =>
      providerEntries.map((provider) => ({
        value: provider.id,
        label: provider.label,
      })),
    [providerEntries],
  );
  const normalizeRoutingValue = React.useCallback(
    (value?: string | null): string | null => {
      if (!value) return null;
      if (parseAgentCliRouteValue(value)) return value;
      const provider = llmConfig?.providers?.[value];
      if (provider?.kind === "agent-cli") {
        const agentId = provider.agent_id?.trim() || provider.model?.trim();
        return agentId ? agentCliRouteValue(agentId) : null;
      }
      return value;
    },
    [llmConfig],
  );

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        open={providersExpanded}
        onOpenChange={setProvidersExpanded}
        title={tr("providers.title", "Providers")}
        description={tr(
          "providers.sectionDescription",
          "Add and manage model providers Atmos can use for features and background tasks.",
        )}
        headerEnd={
          isLlmConfigLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl" />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProviderDialogState({ open: true, providerId: null })}
            >
              {tr("providers.addButtonLabel", "Add provider")}
            </Button>
          )
        }
      >
        {isLlmConfigLoading ? (
          <div className="space-y-3 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : providerEntries.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {tr("providers.emptyState", "No providers added yet.")}
          </p>
        ) : (
          providerEntries.map((provider) => (
            <SettingsGroupRow
              key={provider.id}
              wide
              title={provider.label}
              description={
                provider.kind === "local-managed"
                  ? tr("providers.managedLocalModel", "Managed local model")
                  : (provider.model || provider.kind)
              }
            >
              <div className="flex items-center justify-end gap-2">
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
                        "h-7 px-2 text-xs",
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
                        ? tr("providerTest.status.testing", "Testing…")
                        : providerTests[provider.id]?.status === "pass"
                          ? tr("providerTest.status.pass", "Passed")
                          : providerTests[provider.id]?.status === "fail"
                            ? tr("providerTest.status.fail", "Failed")
                            : tr("providerTest.status.idle", "Test")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[420px] p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {tr("providerTest.title", "Provider test")}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            if (!llmConfig?.providers?.[provider.id]) return;
                            void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                          }}
                        >
                          {tr("providerTest.retest", "Retest")}
                        </Button>
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap text-foreground">
                        {providerTests[provider.id]?.output ||
                          (providerTests[provider.id]?.status === "testing"
                            ? tr(
                                "providerTest.streaming",
                                "Receiving response…",
                              )
                            : tr(
                                "providerTest.startHint",
                                "Click Test to start.",
                              ))}
                      </pre>
                    </div>
                  </PopoverContent>
                </Popover>
                {provider.kind !== "local-managed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setProviderDialogState({ open: true, providerId: provider.id })
                    }
                  >
                    {tr("providers.editButton", "Edit")}
                  </Button>
                )}
                <Switch
                  checked={provider.enabled}
                  disabled={providerToggleId === provider.id}
                  aria-label={tr("providers.enabled", "Enabled")}
                  onCheckedChange={(checked) => {
                    void handleProviderEnabledChange(provider.id, !!checked);
                  }}
                />
              </div>
            </SettingsGroupRow>
          ))
        )}
      </SettingsGroupCard>

      <SettingsGroupCard
        open={routingExpanded}
        onOpenChange={setRoutingExpanded}
        title={tr("routing.title", "Routing")}
        description={tr(
          "routing.sectionDescription",
          "Choose which provider handles each AI capability.",
        )}
      >
        {isLlmConfigLoading ? (
          <div className="space-y-3 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SettingsGroupRow
              wide
              title={tr("routing.gitCommit.title", "Git commit generation")}
              description={
                llmConfig?.features?.git_commit_language?.trim() ||
                tr(
                  "routing.defaultLanguageSummary",
                  "Use the prompt default language",
                )
              }
            >
              <div className="flex items-center justify-end gap-2">
                <FeatureSelect
                  className="w-[220px]"
                  value={normalizeRoutingValue(llmConfig?.features?.git_commit)}
                  providerOptions={providerOptions}
                  localAgentOptions={localAgentOptions}
                  noneLabel={tr("routing.disabled", "Disabled")}
                  disabled={routingSavingKey === "git_commit"}
                  onChange={(value) => {
                    void handleLlmConfigUpdate("git_commit", (current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        git_commit: value,
                      },
                    }));
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Languages className="size-4" />
                      {tr("routing.languageButton", "Language")}
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
                      {tr("routing.usePromptDefault", "Use prompt default")}
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
            </SettingsGroupRow>

            <SettingsGroupRow
              wide
              title={tr(
                "routing.workspaceIssueTodo.title",
                "Workspace issue TODO extraction",
              )}
              description={
                llmConfig?.features?.workspace_issue_todo_language?.trim() ||
                tr(
                  "routing.defaultLanguageSummary",
                  "Use the prompt default language",
                )
              }
            >
              <div className="flex items-center justify-end gap-2">
                <FeatureSelect
                  className="w-[220px]"
                  value={normalizeRoutingValue(
                    llmConfig?.features?.workspace_issue_todo,
                  )}
                  providerOptions={providerOptions}
                  localAgentOptions={localAgentOptions}
                  noneLabel={tr("routing.disabled", "Disabled")}
                  disabled={routingSavingKey === "workspace_issue_todo"}
                  onChange={(value) => {
                    void handleLlmConfigUpdate("workspace_issue_todo", (current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        workspace_issue_todo: value,
                      },
                    }));
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Languages className="size-4" />
                      {tr("routing.languageButton", "Language")}
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
                      {tr("routing.usePromptDefault", "Use prompt default")}
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
            </SettingsGroupRow>
          </>
        )}
      </SettingsGroupCard>

      <SettingsGroupCard
        title={tr("localModel.title", "Local model")}
        description={tr(
          "localModel.sectionDescription",
          "Run smaller models on this device without an API key.",
        )}
        headerEnd={<LocalModelRuntimeControl />}
      >
        <div className="px-2 py-3">
          <LocalModelPanel onDownloadComplete={() => void loadLlmConfig()} />
        </div>
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
