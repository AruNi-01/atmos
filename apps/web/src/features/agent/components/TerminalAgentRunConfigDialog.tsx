"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
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
import { useOpenSettings } from "@/features/settings/lib/open-settings";
import { cn } from "@/shared/lib/utils";

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
  const t = useTranslations("Agent.components");
  const openSettings = useOpenSettings();
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
          error: t("runConfig.errors.removeConflictingArgs", { args: conflicts.join(", ") }),
        };
      }
      return { config: nextConfig, error: null };
    } catch (nextError) {
      return {
        config: null,
        error: nextError instanceof Error ? nextError.message : t("runConfig.errors.invalidExtraArgs"),
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
    t,
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

  const handleReset = React.useCallback(() => {
    setModelEnabled(false);
    setModelValue("");
    setReasoningEnabled(false);
    setReasoningValue(defaultReasoningValue(capability.reasoningSupport));
    setExtraArgsText("");
    setSelectedTemplateId("__none__");
    setError(null);
    onApply(null);
  }, [capability.reasoningSupport, onApply]);

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
    openSettings("agents");
  }, [onManageConfigs, openSettings]);

  return (
    <div className={cn("space-y-4", embedded ? "w-full" : "pt-2")}>
      {showHeader ? (!embedded ? (
        <>
          <DialogTitle>{t("runConfig.title", { agentLabel })}</DialogTitle>
          <DialogDescription>
            {t("runConfig.description")}
          </DialogDescription>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("runConfig.title", { agentLabel })}</p>
          <p className="text-xs text-muted-foreground">
            {t("runConfig.description")}
          </p>
        </div>
      )) : null}

      <div className="space-y-4">
        {purpose === "interactive" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span>{t("runConfig.savedConfig.label")}</span>
              </div>
              <button
                type="button"
                onClick={handleOpenCodeAgentSettings}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.manageConfigs")}
              </button>
            </div>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder={t("runConfig.savedConfig.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("runConfig.savedConfig.none")}</SelectItem>
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
            <span>{t("runConfig.automation.info")}</span>
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
                {t("runConfig.automation.tooltip")}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>

      {canConfigureModel ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("runConfig.model.title")}</p>
              <p className="text-xs text-muted-foreground">
                {capability.modelInputMode === "catalog"
                  ? t("runConfig.model.catalogDescription")
                  : t("runConfig.model.manualDescription")}
              </p>
            </div>
            <Switch checked={modelEnabled} onCheckedChange={setModelEnabled} />
          </div>
          {modelEnabled ? (
            <div className="space-y-2">
              {capability.modelInputMode === "catalog" && modelCatalog?.status === "ok" ? (
                <Select value={modelValue || undefined} onValueChange={setModelValue}>
                  <SelectTrigger>
                    <SelectValue placeholder={modelCatalogLoading
                      ? t("runConfig.model.loadingModels")
                      : t("runConfig.model.chooseModel")} />
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
                  placeholder={definition?.modelList?.supported
                    ? t("runConfig.model.examplePlaceholder")
                    : t("runConfig.model.enterModelId")}
                />
              )}
              {capability.modelInputMode === "catalog" ? (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {modelCatalogLoading
                      ? t("runConfig.model.loadingAvailableModels")
                      : modelCatalog?.status === "ok"
                        ? t("runConfig.model.usingSource", {
                          source: modelCatalog.source === "cache"
                            ? t("runConfig.model.source.cached")
                            : t("runConfig.model.source.live"),
                        })
                        : modelCatalog?.message ?? t("runConfig.model.liveUnavailable")}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void reloadModelCatalog()}>
                    {t("common.refresh")}
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
              <p className="text-sm font-medium text-foreground">{t("runConfig.reasoning.title")}</p>
              <p className="text-xs text-muted-foreground">
                {reasoningSupport.mode === "manual"
                  ? t("runConfig.reasoning.manualDescription")
                  : t("runConfig.reasoning.enumDescription")}
              </p>
            </div>
            <Switch checked={reasoningEnabled} onCheckedChange={setReasoningEnabled} />
          </div>
          {reasoningEnabled ? (
            reasoningSupport.mode === "manual" ? (
              <Input
                value={reasoningValue}
                onChange={(event) => setReasoningValue(event.target.value)}
                placeholder={reasoningSupport.placeholder ?? t("runConfig.reasoning.enterValue")}
              />
            ) : (
              <Select value={reasoningValue} onValueChange={setReasoningValue}>
                <SelectTrigger>
                  <SelectValue placeholder={t("runConfig.reasoning.choose")} />
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
          <p className="text-sm font-medium text-foreground">{t("runConfig.extraArgs.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("runConfig.extraArgs.description")}
          </p>
        </div>
        <Input
          value={extraArgsText}
          onChange={(event) => setExtraArgsText(event.target.value)}
          placeholder={t("runConfig.extraArgs.placeholder")}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showActions ? (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={handleReset}>
            {t("common.reset")}
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={handleApply}>
              {t("common.apply")}
            </Button>
          </div>
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
