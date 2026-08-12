"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Switch,
  cn,
} from "@workspace/ui";
import { ChevronDown, Timer } from "lucide-react";
import { useAutomationAgentCapabilitiesQuery } from "@/features/automations/hooks/use-automations-query";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

export type BehaviourSettingsValues = {
  idleSessionTimeoutMins: number;
  attentionSummaryEnabled: boolean;
  attentionSummaryDelayMins: number;
  attentionSummaryAgentId: string;
  attentionSummaryModel: string;
};

export type CodeAgentBehaviourSettingsSectionProps = {
  idleSessionTimeoutMins: number;
  attentionSummaryEnabled: boolean;
  attentionSummaryDelayMins: number;
  attentionSummaryAgentId: string;
  attentionSummaryModel: string;
  savedIdleSessionTimeoutMins: number;
  savedAttentionSummaryEnabled: boolean;
  savedAttentionSummaryDelayMins: number;
  savedAttentionSummaryAgentId: string;
  savedAttentionSummaryModel: string;
  savingIdleTimeout: boolean;
  onCommitBehaviourSettings: (values: BehaviourSettingsValues) => void | Promise<void>;
  setIdleSessionTimeoutMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAttentionSummaryDelayMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryAgentId: React.Dispatch<React.SetStateAction<string>>;
  setAttentionSummaryModel: React.Dispatch<React.SetStateAction<string>>;
};

/**
 * Idle cleanup + need-attention auto-summary settings (Behaviour collapsible).
 * Extracted from CodeAgentSettingsSection so agent registry UI and behaviour
 * policy do not share one 800-line surface.
 */
export function CodeAgentBehaviourSettingsSection({
  idleSessionTimeoutMins,
  attentionSummaryEnabled,
  attentionSummaryDelayMins,
  attentionSummaryAgentId,
  attentionSummaryModel,
  savedIdleSessionTimeoutMins,
  savedAttentionSummaryEnabled,
  savedAttentionSummaryDelayMins,
  savedAttentionSummaryAgentId,
  savedAttentionSummaryModel,
  savingIdleTimeout,
  onCommitBehaviourSettings,
  setIdleSessionTimeoutMins,
  setAttentionSummaryEnabled,
  setAttentionSummaryDelayMins,
  setAttentionSummaryAgentId,
  setAttentionSummaryModel,
}: CodeAgentBehaviourSettingsSectionProps) {
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

          {/* Need-attention auto-summary — group row + nested bordered config */}
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
  );
}
