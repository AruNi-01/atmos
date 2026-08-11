"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Skeleton,
  Switch,
  cn,
} from "@workspace/ui";
import {
  Bot,
  ChevronDown,
  LoaderCircle,
  Package,
  Plus,
  Timer,
  Trash2,
  UserCog,
  Zap,
} from "lucide-react";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import { resolveAgentLaunchFlags } from "@/features/agent/lib/terminal-agent-yolo";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { CodeAgentCustomEntry } from "@/api/ws-api";
import { AgentActivityIndicatorsSettingsSection } from "@/features/settings/components/AgentActivityIndicatorsSettingsSection";
import { AgentHookStatusCard } from "@/features/settings/components/AgentHookStatusCard";
import { CodeAgentRunConfigSettingsSection } from "@/features/settings/components/CodeAgentRunConfigSettingsSection";
import { SaveActionButton } from "@/features/settings/components/settings/SaveActionButton";
import { useAutomationAgentCapabilitiesQuery } from "@/features/automations/hooks/use-automations-query";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";
import type {
  TerminalAgentRunConfigInput,
  TerminalAgentSavedRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";

type BuiltInAgentSettings = Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }>;
type AgentOption = { id: string; label: string };

export type BehaviourSettingsValues = {
  idleSessionTimeoutMins: number;
  attentionSummaryEnabled: boolean;
  attentionSummaryDelayMins: number;
  attentionSummaryAgentId: string;
  attentionSummaryModel: string;
};

interface CodeAgentSettingsSectionProps {
  agentCustomSettings: BuiltInAgentSettings;
  agentSettingsLoading: boolean;
  builtInAgentOpen: Record<string, boolean>;
  builtInAgentsExpanded: boolean;
  customAgentOpen: Record<string, boolean>;
  customAgents: CodeAgentCustomEntry[];
  customAgentsExpanded: boolean;
  idleSessionTimeoutMins: number;
  attentionSummaryEnabled: boolean;
  attentionSummaryDelayMins: number;
  attentionSummaryAgentId: string;
  attentionSummaryModel: string;
  runConfigAgentOptions: AgentOption[];
  runConfigsLoading: boolean;
  removingCustomAgentIds: Record<string, boolean>;
  savedRunConfigs: TerminalAgentSavedRunConfig[];
  savedAgentCustomSettings: BuiltInAgentSettings;
  savedCustomAgents: CodeAgentCustomEntry[];
  savedIdleSessionTimeoutMins: number;
  savedAttentionSummaryEnabled: boolean;
  savedAttentionSummaryDelayMins: number;
  savedAttentionSummaryAgentId: string;
  savedAttentionSummaryModel: string;
  savingBuiltInAgentIds: Record<string, boolean>;
  savingCustomAgentIds: Record<string, boolean>;
  savingIdleTimeout: boolean;
  savingRunConfigs: boolean;
  syncingBuiltInEnabledIds: Record<string, boolean>;
  syncingCustomEnabledIds: Record<string, boolean>;
  yoloMode: boolean;
  yoloModeSyncing: boolean;
  yoloModeRestoring: boolean;
  onYoloModeChange: (enabled: boolean) => void;
  onRestoreAllYoloMode: () => void;
  showAgentNameInTerminalTitles: boolean;
  showAgentNameInTerminalTitlesSyncing: boolean;
  onShowAgentNameInTerminalTitlesChange: (enabled: boolean) => void;
  onAddCustomAgent: () => void;
  onAgentSettingChange: (agentId: string, field: "cmd" | "flags" | "interactiveFlags" | "enabled", value: string | boolean) => void;
  onBuiltInEnabledChange: (agentId: string, enabled: boolean) => void;
  onCustomAgentChange: (id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => void;
  onCustomAgentEnabledChange: (id: string, enabled: boolean) => void;
  onRemoveCustomAgent: (id: string) => void;
  onSaveBuiltInAgent: (agentId: string) => void;
  onSaveCustomAgent: (id: string) => void;
  onCommitBehaviourSettings: (values: BehaviourSettingsValues) => void | Promise<void>;
  onSaveRunConfigs: (configs: TerminalAgentSavedRunConfig[]) => Promise<void>;
  setBuiltInAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setBuiltInAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCustomAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setIdleSessionTimeoutMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAttentionSummaryDelayMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryAgentId: React.Dispatch<React.SetStateAction<string>>;
  setAttentionSummaryModel: React.Dispatch<React.SetStateAction<string>>;
}

export function CodeAgentSettingsSection({
  agentCustomSettings,
  agentSettingsLoading,
  builtInAgentOpen,
  builtInAgentsExpanded,
  customAgentOpen,
  customAgents,
  customAgentsExpanded,
  idleSessionTimeoutMins,
  attentionSummaryEnabled,
  attentionSummaryDelayMins,
  attentionSummaryAgentId,
  attentionSummaryModel,
  runConfigAgentOptions,
  runConfigsLoading,
  removingCustomAgentIds,
  savedRunConfigs,
  savedAgentCustomSettings,
  savedCustomAgents,
  savedIdleSessionTimeoutMins,
  savedAttentionSummaryEnabled,
  savedAttentionSummaryDelayMins,
  savedAttentionSummaryAgentId,
  savedAttentionSummaryModel,
  savingBuiltInAgentIds,
  savingCustomAgentIds,
  savingIdleTimeout,
  savingRunConfigs,
  syncingBuiltInEnabledIds,
  syncingCustomEnabledIds,
  yoloMode,
  yoloModeSyncing,
  yoloModeRestoring,
  onYoloModeChange,
  onRestoreAllYoloMode,
  showAgentNameInTerminalTitles,
  showAgentNameInTerminalTitlesSyncing,
  onShowAgentNameInTerminalTitlesChange,
  onAddCustomAgent,
  onAgentSettingChange,
  onBuiltInEnabledChange,
  onCustomAgentChange,
  onCustomAgentEnabledChange,
  onRemoveCustomAgent,
  onSaveBuiltInAgent,
  onSaveCustomAgent,
  onCommitBehaviourSettings,
  onSaveRunConfigs,
  setBuiltInAgentOpen,
  setBuiltInAgentsExpanded,
  setCustomAgentOpen,
  setCustomAgentsExpanded,
  setIdleSessionTimeoutMins,
  setAttentionSummaryEnabled,
  setAttentionSummaryDelayMins,
  setAttentionSummaryAgentId,
  setAttentionSummaryModel,
}: CodeAgentSettingsSectionProps) {
  const t = useTranslations("settings.codeAgentSection");
  const tAutomationAgents = useTranslations("automation.setup.agentOptions");
  const agentCapabilitiesQuery = useAutomationAgentCapabilitiesQuery();
  const [behaviourExpanded, setBehaviourExpanded] = React.useState(false);

  const behaviourValues = React.useCallback(
    (patch: Partial<BehaviourSettingsValues> = {}): BehaviourSettingsValues => ({
      idleSessionTimeoutMins,
      attentionSummaryEnabled,
      attentionSummaryDelayMins,
      attentionSummaryAgentId,
      attentionSummaryModel,
      ...patch,
    }),
    [
      idleSessionTimeoutMins,
      attentionSummaryEnabled,
      attentionSummaryDelayMins,
      attentionSummaryAgentId,
      attentionSummaryModel,
    ],
  );

  const isBehaviourDirty = React.useCallback(
    (values: BehaviourSettingsValues) =>
      values.idleSessionTimeoutMins !== savedIdleSessionTimeoutMins ||
      values.attentionSummaryEnabled !== savedAttentionSummaryEnabled ||
      values.attentionSummaryDelayMins !== savedAttentionSummaryDelayMins ||
      values.attentionSummaryAgentId !== savedAttentionSummaryAgentId ||
      values.attentionSummaryModel !== savedAttentionSummaryModel,
    [
      savedIdleSessionTimeoutMins,
      savedAttentionSummaryEnabled,
      savedAttentionSummaryDelayMins,
      savedAttentionSummaryAgentId,
      savedAttentionSummaryModel,
    ],
  );

  const commitBehaviour = React.useCallback(
    (patch: Partial<BehaviourSettingsValues> = {}) => {
      const next = behaviourValues(patch);
      if (!isBehaviourDirty(next)) return;
      void onCommitBehaviourSettings(next);
    },
    [behaviourValues, isBehaviourDirty, onCommitBehaviourSettings],
  );

  const summaryAgentSelectValue = attentionSummaryAgentId.trim();

  /** Same agent menu as Automation create (Ready / Unavailable + run config gear). */
  const summaryAgentOptions = React.useMemo<AgentMenuOption[]>(() => {
    const capabilities = agentCapabilitiesQuery.data?.agents ?? [];
    const options: AgentMenuOption[] = capabilities.map((agent) => ({
      id: agent.agent_id,
      label: agent.label,
      command: "",
      launchCommand: "",
      iconType: "built-in" as const,
      description: agent.automation_supported
        ? tAutomationAgents("ready")
        : tAutomationAgents("unavailable"),
      disabledReason: agent.automation_supported
        ? null
        : (agent.unavailable_reason ?? tAutomationAgents("unavailableReason")),
    }));
    const selectedId = summaryAgentSelectValue;
    if (selectedId && !options.some((item) => item.id === selectedId)) {
      options.push({
        id: selectedId,
        label: selectedId,
        command: "",
        launchCommand: "",
        iconType: "custom",
        description: tAutomationAgents("ready"),
      });
    }
    return options;
  }, [agentCapabilitiesQuery.data?.agents, summaryAgentSelectValue, tAutomationAgents]);

  const summaryRunConfig = React.useMemo<TerminalAgentRunConfigInput | null>(() => {
    const model = attentionSummaryModel.trim();
    return model ? { model } : null;
  }, [attentionSummaryModel]);

  const summaryRunConfigByAgentId = React.useMemo(
    () =>
      summaryAgentSelectValue
        ? { [summaryAgentSelectValue]: summaryRunConfig }
        : {},
    [summaryAgentSelectValue, summaryRunConfig],
  );

  const handleSummaryAgentChange = React.useCallback(
    (agentId: string) => {
      if (agentId === attentionSummaryAgentId.trim()) return;
      // Switching agents clears the model override; re-apply via run config if needed.
      setAttentionSummaryAgentId(agentId);
      setAttentionSummaryModel("");
      commitBehaviour({
        attentionSummaryAgentId: agentId,
        attentionSummaryModel: "",
      });
    },
    [
      attentionSummaryAgentId,
      commitBehaviour,
      setAttentionSummaryAgentId,
      setAttentionSummaryModel,
    ],
  );

  const handleSummaryRunConfigChange = React.useCallback(
    (agentId: string, value: TerminalAgentRunConfigInput | null) => {
      const nextModel = value?.model?.trim() || "";
      setAttentionSummaryAgentId(agentId);
      setAttentionSummaryModel(nextModel);
      commitBehaviour({
        attentionSummaryAgentId: agentId,
        attentionSummaryModel: nextModel,
      });
    },
    [commitBehaviour, setAttentionSummaryAgentId, setAttentionSummaryModel],
  );

  const commitIdleTimeout = React.useCallback(() => {
    const clamped = Math.min(1440, Math.max(1, idleSessionTimeoutMins || 1));
    if (clamped !== idleSessionTimeoutMins) {
      setIdleSessionTimeoutMins(clamped);
    }
    commitBehaviour({ idleSessionTimeoutMins: clamped });
  }, [commitBehaviour, idleSessionTimeoutMins, setIdleSessionTimeoutMins]);

  const commitSummaryDelay = React.useCallback(() => {
    const clamped = Math.min(1440, Math.max(1, attentionSummaryDelayMins || 1));
    if (clamped !== attentionSummaryDelayMins) {
      setAttentionSummaryDelayMins(clamped);
    }
    commitBehaviour({ attentionSummaryDelayMins: clamped });
  }, [attentionSummaryDelayMins, commitBehaviour, setAttentionSummaryDelayMins]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <Zap className="mt-0.5 size-5 shrink-0 text-foreground" />
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t("yolo.title")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("yolo.description")}
              </p>
            </div>
          </div>
          <Switch
            checked={yoloMode}
            disabled={yoloModeSyncing || yoloModeRestoring}
            onCheckedChange={(checked) => onYoloModeChange(!!checked)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-xs leading-5 text-muted-foreground">{t("yolo.restoreHint")}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={yoloModeSyncing || yoloModeRestoring}
            className="shrink-0 cursor-pointer"
            onClick={onRestoreAllYoloMode}
          >
            {yoloModeRestoring ? (
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
            ) : null}
            {t("yolo.restoreAll")}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <Bot className="mt-0.5 size-5 shrink-0 text-foreground" />
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">
                {t("showAgentName.title")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("showAgentName.description")}
              </p>
            </div>
          </div>
          <Switch
            checked={showAgentNameInTerminalTitles}
            disabled={showAgentNameInTerminalTitlesSyncing}
            onCheckedChange={(checked) => onShowAgentNameInTerminalTitlesChange(!!checked)}
          />
        </div>
      </div>

      <AgentActivityIndicatorsSettingsSection />

      <Collapsible
        open={builtInAgentsExpanded}
        onOpenChange={setBuiltInAgentsExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Package className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">{t("builtIn.title")}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("builtIn.description")}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          {agentSettingsLoading ? (
            <div className="space-y-3 border-t border-border px-6 py-4">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {AGENT_OPTIONS.map((agent) => {
                const custom = agentCustomSettings[agent.id];
                const isOpen = builtInAgentOpen[agent.id] ?? false;
                const defaults = resolveAgentLaunchFlags(agent, yoloMode);
                const savedAgent = savedAgentCustomSettings[agent.id];
                const isDirty =
                  (savedAgent?.cmd ?? agent.cmd) !== (custom?.cmd ?? agent.cmd) ||
                  (savedAgent?.flags ?? defaults.params) !== (custom?.flags ?? defaults.params) ||
                  (savedAgent?.interactiveFlags ?? defaults.interactiveParams) !==
                    (custom?.interactiveFlags ?? defaults.interactiveParams);
                const isSaving = !!savingBuiltInAgentIds[agent.id];
                const isSyncingEnabled = !!syncingBuiltInEnabledIds[agent.id];
                const enabled = custom?.enabled ?? true;
                const summary = [
                  custom?.cmd ?? agent.cmd,
                  custom?.interactiveFlags ??
                    getInteractiveAgentParams(agent, custom?.flags, yoloMode),
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Collapsible
                    key={agent.id}
                    open={isOpen}
                    onOpenChange={(open) => setBuiltInAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                    className="border-b border-border px-2 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <span className="relative size-5 shrink-0">
                          <span className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0">
                            <AgentIcon registryId={agent.id} name={agent.label} size={20} />
                          </span>
                          <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{agent.label}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {summary || t("common.noParameters")}
                          </p>
                        </div>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-3">
                        {(isDirty || isSaving) && (
                          <SaveActionButton saving={isSaving} onClick={() => onSaveBuiltInAgent(agent.id)} />
                        )}
                        <Switch
                          checked={enabled}
                          disabled={isSyncingEnabled}
                          onCheckedChange={(checked) => onBuiltInEnabledChange(agent.id, !!checked)}
                        />
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="space-y-3 pt-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">{t("fields.command")}</label>
                            <Input
                              value={custom?.cmd ?? agent.cmd}
                              placeholder={agent.cmd}
                              onChange={(event) => onAgentSettingChange(agent.id, "cmd", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                              {t("fields.interactiveParameters")}
                            </label>
                            <Input
                              value={custom?.interactiveFlags ?? defaults.interactiveParams}
                              placeholder={defaults.interactiveParams || t("common.noParameters")}
                              onChange={(event) => onAgentSettingChange(agent.id, "interactiveFlags", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">
                            {t("fields.automationParameters")}
                          </label>
                          <Input
                            value={custom?.flags ?? defaults.params}
                            placeholder={defaults.params || t("common.noDefaultParameters")}
                            onChange={(event) => onAgentSettingChange(agent.id, "flags", event.target.value)}
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={customAgentsExpanded}
        onOpenChange={setCustomAgentsExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <UserCog className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">{t("custom.title")}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("custom.description")}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <Button variant="outline" onClick={onAddCustomAgent}>
            <Plus className="mr-2 size-4" />
            {t("custom.addAgent")}
          </Button>
        </div>

        <CollapsibleContent>
          {customAgents.length === 0 ? (
            <div className="border-t border-border px-6 py-5 text-sm text-muted-foreground">
              {t("custom.empty")}
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {customAgents.map((agent) => {
                const isOpen = customAgentOpen[agent.id] ?? false;
                const savedAgent = savedCustomAgents.find((item) => item.id === agent.id);
                const isDirty =
                  !savedAgent ||
                  savedAgent.label !== agent.label ||
                  savedAgent.cmd !== agent.cmd ||
                  savedAgent.flags !== agent.flags;
                const isSaving = !!savingCustomAgentIds[agent.id];
                const isSyncingEnabled = !!syncingCustomEnabledIds[agent.id];
                const isRemoving = !!removingCustomAgentIds[agent.id];
                const enabled = agent.enabled !== false;
                const summary = [agent.cmd, agent.flags].filter(Boolean).join(" ");

                return (
                  <Collapsible
                    key={agent.id}
                    open={isOpen}
                    onOpenChange={(open) => setCustomAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                    className="border-b border-border px-2 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <span className="relative size-5 shrink-0">
                          <Bot className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                          <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {agent.label || t("custom.newAgent")}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {summary || t("common.noParameters")}
                          </p>
                        </div>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-3">
                        {(isDirty || isSaving) && (
                          <SaveActionButton saving={isSaving} onClick={() => onSaveCustomAgent(agent.id)} />
                        )}
                        <Switch
                          checked={enabled}
                          disabled={isSyncingEnabled}
                          onCheckedChange={(checked) => onCustomAgentEnabledChange(agent.id, !!checked)}
                        />
                      </div>
                      <button
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemoveCustomAgent(agent.id)}
                        title={t("custom.removeAgent")}
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <LoaderCircle className="size-4 animate-spin-reverse" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </div>

                    <CollapsibleContent>
                      <div className="space-y-3 pt-4">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">{t("fields.name")}</label>
                          <Input
                            value={agent.label}
                            placeholder={t("custom.placeholders.name")}
                            onChange={(event) => onCustomAgentChange(agent.id, "label", event.target.value)}
                            className="h-9 text-sm font-medium"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">{t("fields.command")}</label>
                            <Input
                              value={agent.cmd}
                              placeholder={t("custom.placeholders.command")}
                              onChange={(event) => onCustomAgentChange(agent.id, "cmd", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">{t("fields.parameters")}</label>
                            <Input
                              value={agent.flags}
                              placeholder={t("custom.placeholders.parameters")}
                              onChange={(event) => onCustomAgentChange(agent.id, "flags", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <CodeAgentRunConfigSettingsSection
        agentOptions={runConfigAgentOptions}
        loading={runConfigsLoading}
        runConfigs={savedRunConfigs}
        saving={savingRunConfigs}
        onSaveRunConfigs={onSaveRunConfigs}
      />

      {/* Behaviour: group rows like Built-in Agents */}
      <Collapsible
        open={behaviourExpanded}
        onOpenChange={setBehaviourExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Timer className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">{t("behavior.title")}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("behavior.description")}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4">
            {/* Idle session cleanup — group row (same level as Need-attention) */}
            <div className="border-b border-border px-2 py-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("behavior.idleCleanupTitle")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("behavior.idleCleanupDescription")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={idleSessionTimeoutMins}
                    disabled={savingIdleTimeout}
                    onChange={(event) =>
                      setIdleSessionTimeoutMins(Math.max(1, Number(event.target.value) || 1))
                    }
                    onBlur={() => commitIdleTimeout()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-8 w-20 text-center text-sm"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {t("behavior.minutes")}
                  </span>
                </div>
              </div>
            </div>

            {/* Need-attention auto-summary — group row + nested bordered config (not collapsible) */}
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("behavior.summaryTitle")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("behavior.summaryDescription")}
                  </p>
                </div>
                <Switch
                  checked={attentionSummaryEnabled}
                  disabled={savingIdleTimeout}
                  onCheckedChange={(checked) => {
                    const enabled = !!checked;
                    setAttentionSummaryEnabled(enabled);
                    commitBehaviour({ attentionSummaryEnabled: enabled });
                  }}
                  aria-label={t("behavior.summaryEnabled")}
                />
              </div>

              <div
                className={cn(
                  "mt-4 space-y-4 rounded-xl border border-border p-4",
                  !attentionSummaryEnabled && "pointer-events-none opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {t("behavior.summaryDelayTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("behavior.summaryDelayDescription")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={attentionSummaryDelayMins}
                      disabled={!attentionSummaryEnabled || savingIdleTimeout}
                      onChange={(event) =>
                        setAttentionSummaryDelayMins(
                          Math.min(1440, Math.max(1, Number(event.target.value) || 1)),
                        )
                      }
                      onBlur={() => commitSummaryDelay()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="h-8 w-20 text-center text-sm"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {t("behavior.minutes")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {t("behavior.summaryAgentTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("behavior.summaryAgentDescription")}
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    <WelcomeAgentSelector
                      availableAgents={summaryAgentOptions}
                      selectedAgentId={summaryAgentSelectValue}
                      runConfigByAgentId={summaryRunConfigByAgentId}
                      onRunConfigChange={handleSummaryRunConfigChange}
                      onSelectAgent={handleSummaryAgentChange}
                      purpose="automation"
                      triggerPlacement="inline"
                      contentAlign="end"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AgentHookStatusCard />
    </div>
  );
}
