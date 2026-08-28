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
  Plus,
  Trash2,
} from "lucide-react";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import { resolveAgentLaunchFlags } from "@/features/agent/lib/terminal-agent-yolo";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { CodeAgentCustomEntry } from "@/api/ws-api";
import { AgentActivityIndicatorsSettingsSection } from "@/features/settings/components/AgentActivityIndicatorsSettingsSection";
import { AgentHookStatusCard } from "@/features/settings/components/AgentHookStatusCard";
import {
  CodeAgentBehaviourSettingsSection,
  type BehaviourSettingsValues,
} from "@/features/settings/components/CodeAgentBehaviourSettingsSection";
import { CodeAgentRunConfigSettingsSection } from "@/features/settings/components/CodeAgentRunConfigSettingsSection";
import { SaveActionButton } from "@/features/settings/components/settings/SaveActionButton";
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
  settingsCollapsibleChevronTriggerClassName,
  settingsCollapsibleTitleClassName,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { SettingsToggleRow } from "@/features/settings/components/settings/SettingsToggleRow";
import type { TerminalAgentSavedRunConfig } from "@/features/agent/lib/terminal-agent-run-config";

export type { BehaviourSettingsValues };

type BuiltInAgentSettings = Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }>;
type AgentOption = { id: string; label: string };

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
  followupPolicy: "queue" | "steer";
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
  savedFollowupPolicy: "queue" | "steer";
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
  setFollowupPolicy: React.Dispatch<React.SetStateAction<"queue" | "steer">>;
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
  followupPolicy,
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
  savedFollowupPolicy,
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
  setFollowupPolicy,
}: CodeAgentSettingsSectionProps) {
  const t = useTranslations("settings.codeAgentSection");

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        id="defaults"
        title={t("defaults.title")}
        description={t("defaults.description")}
      >
        <SettingsToggleRow
          title={t("yolo.title")}
          description={t("yolo.description")}
          checked={yoloMode}
          disabled={yoloModeSyncing || yoloModeRestoring}
          onCheckedChange={(checked) => onYoloModeChange(checked)}
        />
        <SettingsGroupRow title={t("yolo.restoreAll")} description={t("yolo.restoreHint")} wide>
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
        </SettingsGroupRow>
        <SettingsToggleRow
          title={t("showAgentName.title")}
          description={t("showAgentName.description")}
          checked={showAgentNameInTerminalTitles}
          disabled={showAgentNameInTerminalTitlesSyncing}
          onCheckedChange={(checked) => onShowAgentNameInTerminalTitlesChange(checked)}
        />
      </SettingsGroupCard>

      <AgentActivityIndicatorsSettingsSection />

      <SettingsGroupCard
        open={builtInAgentsExpanded}
        onOpenChange={setBuiltInAgentsExpanded}
        title={t("builtIn.title")}
        description={t("builtIn.description")}
      >
        {agentSettingsLoading ? (
          <div className="space-y-3 py-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : (
          AGENT_OPTIONS.map((agent) => {
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
                    className="border-b border-border/60 px-2 py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <AgentIcon registryId={agent.id} name={agent.label} size={20} />
                        <div className="min-w-0 flex-1">
                          <p className={settingsCollapsibleTitleClassName}>{agent.label}</p>
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
                        <CollapsibleTrigger className={settingsCollapsibleChevronTriggerClassName}>
                          <ChevronDown
                            className={`size-4 transition-transform duration-150 ${!isOpen ? "-rotate-90" : ""}`}
                          />
                        </CollapsibleTrigger>
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
              })
        )}
      </SettingsGroupCard>

      <SettingsGroupCard
        open={customAgentsExpanded}
        onOpenChange={setCustomAgentsExpanded}
        title={t("custom.title")}
        description={t("custom.description")}
        headerEnd={
          <Button variant="outline" onClick={onAddCustomAgent}>
            <Plus className="mr-2 size-4" />
            {t("custom.addAgent")}
          </Button>
        }
      >
          {customAgents.length === 0 ? (
            <div className="py-3 text-sm text-muted-foreground">
              {t("custom.empty")}
            </div>
          ) : (
            customAgents.map((agent) => {
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
                    className="border-b border-border/60 px-2 py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <Bot className="size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate", settingsCollapsibleTitleClassName)}>
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
                        <CollapsibleTrigger className={settingsCollapsibleChevronTriggerClassName}>
                          <ChevronDown
                            className={`size-4 transition-transform duration-150 ${!isOpen ? "-rotate-90" : ""}`}
                          />
                        </CollapsibleTrigger>
                      </div>
                      <button
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
              })
          )}
      </SettingsGroupCard>

      <CodeAgentRunConfigSettingsSection
        agentOptions={runConfigAgentOptions}
        loading={runConfigsLoading}
        runConfigs={savedRunConfigs}
        saving={savingRunConfigs}
        onSaveRunConfigs={onSaveRunConfigs}
      />

      <CodeAgentBehaviourSettingsSection
        idleSessionTimeoutMins={idleSessionTimeoutMins}
        attentionSummaryEnabled={attentionSummaryEnabled}
        attentionSummaryDelayMins={attentionSummaryDelayMins}
        attentionSummaryAgentId={attentionSummaryAgentId}
        attentionSummaryModel={attentionSummaryModel}
        followupPolicy={followupPolicy}
        savedIdleSessionTimeoutMins={savedIdleSessionTimeoutMins}
        savedAttentionSummaryEnabled={savedAttentionSummaryEnabled}
        savedAttentionSummaryDelayMins={savedAttentionSummaryDelayMins}
        savedAttentionSummaryAgentId={savedAttentionSummaryAgentId}
        savedAttentionSummaryModel={savedAttentionSummaryModel}
        savedFollowupPolicy={savedFollowupPolicy}
        savingIdleTimeout={savingIdleTimeout}
        onCommitBehaviourSettings={onCommitBehaviourSettings}
        setIdleSessionTimeoutMins={setIdleSessionTimeoutMins}
        setAttentionSummaryEnabled={setAttentionSummaryEnabled}
        setAttentionSummaryDelayMins={setAttentionSummaryDelayMins}
        setAttentionSummaryAgentId={setAttentionSummaryAgentId}
        setAttentionSummaryModel={setAttentionSummaryModel}
        setFollowupPolicy={setFollowupPolicy}
      />

      <AgentHookStatusCard />
    </SettingsPageStack>
  );
}
