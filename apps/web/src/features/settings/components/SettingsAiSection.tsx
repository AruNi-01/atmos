"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  Skeleton,
  Switch,
  cn,
} from "@workspace/ui";
import { Building2, ChevronDown, House, Languages, Route } from "lucide-react";

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
              <p className="text-base font-medium text-foreground">
                {tr("providers.title", "提供方")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tr(
                  "providers.sectionDescription",
                  "添加并管理 Atmos 可用于功能与后台任务的模型提供方。",
                )}
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
                {tr("providers.addButtonLabel", "添加提供方")}
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
                {tr("providers.emptyState", "还没有添加任何提供方。")}
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
                                ? tr("providerTest.status.testing", "测试中…")
                                : providerTests[provider.id]?.status === "pass"
                                  ? tr("providerTest.status.pass", "通过")
                                  : providerTests[provider.id]?.status === "fail"
                                    ? tr("providerTest.status.fail", "失败")
                                    : tr("providerTest.status.idle", "测试")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[420px] p-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-foreground">
                                  {tr("providerTest.title", "提供方测试")}
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
                                  {tr("providerTest.retest", "重新测试")}
                                </Button>
                              </div>
                              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                                {providerTests[provider.id]?.output ||
                                  (providerTests[provider.id]?.status === "testing"
                                    ? tr(
                                        "providerTest.streaming",
                                        "正在接收响应…",
                                      )
                                    : tr(
                                        "providerTest.startHint",
                                        "点击“测试”开始。",
                                      ))}
                              </pre>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {provider.kind === "local-managed"
                          ? tr("providers.managedLocalModel", "托管本地模型")
                          : (provider.model || provider.kind)}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {tr("providers.enabled", "启用")}
                        </span>
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
                          {tr("providers.editButton", "编辑")}
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
              <p className="text-base font-medium text-foreground">
                {tr("routing.title", "路由")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tr(
                  "routing.sectionDescription",
                  "为每个 AI 能力任务选择处理它的提供方。",
                )}
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
              </div>
            ) : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {tr("routing.gitCommit.title", "Git 提交生成")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {llmConfig?.features?.git_commit_language?.trim() ||
                        tr(
                          "routing.defaultLanguageSummary",
                          "使用提示词默认语言",
                        )}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <FeatureSelect
                      className="w-[220px]"
                      value={normalizeRoutingValue(llmConfig?.features?.git_commit)}
                      providerOptions={providerOptions}
                      localAgentOptions={localAgentOptions}
                      noneLabel={tr("routing.disabled", "已禁用")}
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
                          {tr("routing.languageButton", "语言")}
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
                          {tr("routing.usePromptDefault", "使用提示词默认值")}
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
                    <p className="text-sm font-medium text-foreground">
                      {tr(
                        "routing.workspaceIssueTodo.title",
                        "工作区问题 TODO 提取",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {llmConfig?.features?.workspace_issue_todo_language?.trim() ||
                        tr(
                          "routing.defaultLanguageSummary",
                          "使用提示词默认语言",
                        )}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <FeatureSelect
                      className="w-[220px]"
                      value={normalizeRoutingValue(
                        llmConfig?.features?.workspace_issue_todo,
                      )}
                      providerOptions={providerOptions}
                      localAgentOptions={localAgentOptions}
                      noneLabel={tr("routing.disabled", "已禁用")}
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
                          {tr("routing.languageButton", "语言")}
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
                          {tr("routing.usePromptDefault", "使用提示词默认值")}
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
              <p className="text-base font-medium text-foreground">
                {tr("localModel.title", "本地模型")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tr(
                  "localModel.sectionDescription",
                  "直接在这台设备上运行较小的模型，无需 API Key。",
                )}
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
