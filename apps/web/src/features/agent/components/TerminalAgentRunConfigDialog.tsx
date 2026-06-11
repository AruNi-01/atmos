"use client";

import * as React from "react";
import { useQueryState } from "nuqs";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { Info } from "lucide-react";

import {
  getTerminalAgentCapability,
  joinExtraArgsText,
  parseExtraArgsText,
  runConfigConflicts,
  sanitizeRunConfig,
  terminalAgentDefinitionById,
  type TerminalAgentReasoningMode,
  type TerminalAgentRunConfigInput,
  type TerminalAgentSavedRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";
import { useTerminalAgentModelCatalog } from "@/features/agent/hooks/use-terminal-agent-model-catalog";
import type { TerminalAgentReasoningSupport } from "@/features/agent/lib/terminal-agent-definitions";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";
import { cn } from "@/shared/lib/utils";

const AUTOMATION_SNAPSHOT_TOOLTIP =
  "Saved configs are just templates. This automation keeps its own snapshot.";

type TerminalAgentRunConfigSharedProps = {
  agentId: string;
  agentLabel: string;
  purpose: "interactive" | "automation" | "settings";
  savedRunConfigs: TerminalAgentSavedRunConfig[];
  value: TerminalAgentRunConfigInput | null | undefined;
  onApply: (value: TerminalAgentRunConfigInput | null) => void;
};

export function TerminalAgentRunConfigContent({
  agentId,
  agentLabel,
  purpose,
  savedRunConfigs,
  value,
  onApply,
  onCancel,
  onManageConfigs,
  embedded = false,
  showHeader = true,
  showActions = true,
  liveApply = false,
}: TerminalAgentRunConfigSharedProps & {
  onCancel: () => void;
  onManageConfigs?: () => void;
  embedded?: boolean;
  showHeader?: boolean;
  showActions?: boolean;
  liveApply?: boolean;
}) {
  const [, setSettingsModalOpen] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [, setActiveSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );
  const capability = React.useMemo(() => getTerminalAgentCapability(agentId), [agentId]);
  const filteredSavedConfigs = React.useMemo(
    () => savedRunConfigs.filter((item) => item.agent_id === agentId),
    [agentId, savedRunConfigs],
  );
  const [modelEnabled, setModelEnabled] = React.useState(false);
  const [modelValue, setModelValue] = React.useState("");
  const [reasoningEnabled, setReasoningEnabled] = React.useState(false);
  const [reasoningValue, setReasoningValue] = React.useState("");
  const [extraArgsText, setExtraArgsText] = React.useState("");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("__none__");
  const [error, setError] = React.useState<string | null>(null);
  const [automationTooltipOpen, setAutomationTooltipOpen] = React.useState(false);
  const [hydratedAgentId, setHydratedAgentId] = React.useState<string | null>(null);
  const lastInitializedAgentIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (liveApply && lastInitializedAgentIdRef.current === agentId) {
      return;
    }
    const config = sanitizeRunConfig(value);
    setModelEnabled(!!config?.model);
    setModelValue(config?.model ?? "");
    setReasoningEnabled(!!config?.reasoning);
    setReasoningValue(
      config?.reasoning?.value ??
        defaultReasoningValue(capability.reasoningSupport),
    );
    setExtraArgsText(joinExtraArgsText(config?.extra_args));
    setSelectedTemplateId("__none__");
    setError(null);
    setHydratedAgentId(agentId);
    lastInitializedAgentIdRef.current = agentId;
  }, [agentId, capability.reasoningSupport, liveApply, value]);

  const definition = terminalAgentDefinitionById(agentId);
  const reasoningSupport = capability.reasoningSupport;
  const canConfigureModel = capability.modelInputMode !== "none";
  const canConfigureReasoning =
    reasoningSupport.mode !== "none" && reasoningSupport.mode !== "encoded_in_model";
  const shouldLoadModelCatalog = modelEnabled && capability.modelInputMode === "catalog";
  const {
    catalog: modelCatalog,
    loading: modelCatalogLoading,
    reload: reloadModelCatalog,
  } = useTerminalAgentModelCatalog(agentId, shouldLoadModelCatalog);
  const reasoningOptions = reasoningSupport.mode === "enum" ? (reasoningSupport.options ?? []) : [];
  const catalogModels = React.useMemo(() => {
    const models = modelCatalog?.models ?? [];
    if (!modelValue || models.some((item) => item.id === modelValue)) {
      return models;
    }
    return [{ id: modelValue, label: modelValue }, ...models];
  }, [modelCatalog?.models, modelValue]);

  const applyTemplate = React.useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      if (templateId === "__none__") {
        const config = sanitizeRunConfig(value);
        setModelEnabled(!!config?.model);
        setModelValue(config?.model ?? "");
        setReasoningEnabled(!!config?.reasoning);
        setReasoningValue(
          config?.reasoning?.value ?? defaultReasoningValue(capability.reasoningSupport),
        );
        setExtraArgsText(joinExtraArgsText(config?.extra_args));
        return;
      }
      const template = filteredSavedConfigs.find((item) => item.id === templateId);
      if (!template) return;
      const config = sanitizeRunConfig(template.config);
      setModelEnabled(!!config?.model);
      setModelValue(config?.model ?? "");
      setReasoningEnabled(!!config?.reasoning);
      setReasoningValue(
        config?.reasoning?.value ?? defaultReasoningValue(capability.reasoningSupport),
      );
      setExtraArgsText(joinExtraArgsText(config?.extra_args));
      setError(null);
    },
    [capability.reasoningSupport, filteredSavedConfigs, value],
  );

  const buildDraftRunConfig = React.useCallback(():
    | { config: TerminalAgentRunConfigInput | null; error: null }
    | { config: null; error: string } => {
    try {
      const nextConfig = sanitizeRunConfig({
        model: canConfigureModel && modelEnabled ? modelValue : null,
        reasoning:
          canConfigureReasoning && reasoningEnabled
            ? {
                mode: reasoningSupport.mode as TerminalAgentReasoningMode,
                value: reasoningValue,
              }
            : null,
        extra_args: parseExtraArgsText(extraArgsText),
      });
      const conflicts = runConfigConflicts(agentId, nextConfig);
      if (conflicts.length > 0) {
        return {
          config: null,
          error: `Remove conflicting extra args: ${conflicts.join(", ")}.`,
        };
      }
      return { config: nextConfig, error: null };
    } catch (nextError) {
      return {
        config: null,
        error: nextError instanceof Error ? nextError.message : "Invalid extra args.",
      };
    }
  }, [
    agentId,
    canConfigureModel,
    canConfigureReasoning,
    extraArgsText,
    modelEnabled,
    modelValue,
    reasoningEnabled,
    reasoningSupport.mode,
    reasoningValue,
  ]);

  const handleApply = React.useCallback(() => {
    const draft = buildDraftRunConfig();
    if (draft.error) {
      setError(draft.error);
      return;
    }
    setError(null);
    onApply(draft.config);
  }, [buildDraftRunConfig, onApply]);

  React.useEffect(() => {
    if (!liveApply) return;
    if (hydratedAgentId !== agentId) return;
    const draft = buildDraftRunConfig();
    setError(draft.error);
    if (!draft.error) {
      onApply(draft.config);
    }
  }, [agentId, buildDraftRunConfig, hydratedAgentId, liveApply, onApply]);

  const handleOpenCodeAgentSettings = React.useCallback(() => {
    onManageConfigs?.();
    void setSettingsModalOpen(true);
    void setActiveSettingTab("code-agent");
  }, [onManageConfigs, setActiveSettingTab, setSettingsModalOpen]);

  return (
    <div className={cn("space-y-4", embedded ? "w-full" : "pt-2")}>
      {showHeader ? (!embedded ? (
        <>
          <DialogTitle>{agentLabel} run config</DialogTitle>
          <DialogDescription>
            Configure model, reasoning, and native CLI args for this agent.
          </DialogDescription>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{agentLabel} run config</p>
          <p className="text-xs text-muted-foreground">
            Configure model, reasoning, and native CLI args for this agent.
          </p>
        </div>
      )) : null}

      <div className="space-y-4">
        {purpose === "interactive" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span>Saved config</span>
              </div>
              <button
                type="button"
                onClick={handleOpenCodeAgentSettings}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage configs
              </button>
            </div>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved config" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No saved config</SelectItem>
                {filteredSavedConfigs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : purpose === "automation" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Run settings are saved as an automation snapshot.</span>
            <Tooltip open={automationTooltipOpen} delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-4 items-center justify-center text-muted-foreground"
                  onPointerEnter={() => setAutomationTooltipOpen(true)}
                  onPointerLeave={() => setAutomationTooltipOpen(false)}
                  onFocus={() => setAutomationTooltipOpen(false)}
                  onBlur={() => setAutomationTooltipOpen(false)}
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-5">
                {AUTOMATION_SNAPSHOT_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>

      {canConfigureModel ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Model</p>
              <p className="text-xs text-muted-foreground">
                {capability.modelInputMode === "catalog"
                  ? "Enter or pick the model for this run."
                  : "Enter the model id for this run."}
              </p>
            </div>
            <Switch checked={modelEnabled} onCheckedChange={setModelEnabled} />
          </div>
          {modelEnabled ? (
            <div className="space-y-2">
              {capability.modelInputMode === "catalog" && modelCatalog?.status === "ok" ? (
                <Select value={modelValue || undefined} onValueChange={setModelValue}>
                  <SelectTrigger>
                    <SelectValue placeholder={modelCatalogLoading ? "Loading models…" : "Choose a model"} />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogModels.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={modelValue}
                  onChange={(event) => setModelValue(event.target.value)}
                  placeholder={definition?.modelList?.supported ? "e.g. claude-sonnet-4.8" : "Enter model id"}
                />
              )}
              {capability.modelInputMode === "catalog" ? (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {modelCatalogLoading
                      ? "Loading available models…"
                      : modelCatalog?.status === "ok"
                        ? `Using ${modelCatalog.source === "cache" ? "cached" : "live"} model list.`
                        : modelCatalog?.message ?? "Live model list unavailable. Enter a model id manually."}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void reloadModelCatalog()}>
                    Refresh
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {canConfigureReasoning ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Reasoning</p>
              <p className="text-xs text-muted-foreground">
                {reasoningSupport.mode === "manual"
                  ? "Enter the agent-specific reasoning value for this run."
                  : "Choose the reasoning setting for this run."}
              </p>
            </div>
            <Switch checked={reasoningEnabled} onCheckedChange={setReasoningEnabled} />
          </div>
          {reasoningEnabled ? (
            reasoningSupport.mode === "manual" ? (
              <Input
                value={reasoningValue}
                onChange={(event) => setReasoningValue(event.target.value)}
                placeholder={reasoningSupport.placeholder ?? "Enter reasoning value"}
              />
            ) : (
              <Select value={reasoningValue} onValueChange={setReasoningValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose reasoning" />
                </SelectTrigger>
                <SelectContent>
                  {reasoningOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Extra args</p>
          <p className="text-xs text-muted-foreground">
            Optional native CLI args. Structured model or reasoning flags should not be duplicated here.
          </p>
        </div>
        <Input
          value={extraArgsText}
          onChange={(event) => setExtraArgsText(event.target.value)}
          placeholder="e.g. --temperature 0.2 --foo bar"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showActions ? (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TerminalAgentRunConfigDialog({
  agentId,
  agentLabel,
  open,
  purpose,
  savedRunConfigs,
  value,
  onApply,
  onOpenChange,
}: {
  agentId: string;
  agentLabel: string;
  open: boolean;
  purpose: "interactive" | "automation" | "settings";
  savedRunConfigs: TerminalAgentSavedRunConfig[];
  value: TerminalAgentRunConfigInput | null | undefined;
  onApply: (value: TerminalAgentRunConfigInput | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <TerminalAgentRunConfigContent
          agentId={agentId}
          agentLabel={agentLabel}
          purpose={purpose}
          savedRunConfigs={savedRunConfigs}
          value={value}
          onApply={(nextValue) => {
            onApply(nextValue);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function defaultReasoningValue(mode: TerminalAgentReasoningSupport): string {
  if (mode.mode === "enum" && (mode.options?.length ?? 0) === 1) {
    return mode.options?.[0] ?? "";
  }
  return "";
}
