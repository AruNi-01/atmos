"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { Info } from "lucide-react";

import { TerminalAgentModelPopover } from "@/features/agent/components/TerminalAgentModelPopover";
import {
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
  type TerminalAgentSavedRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";
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
  const filteredSavedConfigs = React.useMemo(
    () => savedRunConfigs.filter((item) => item.agent_id === agentId),
    [agentId, savedRunConfigs],
  );
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("__none__");
  const [automationTooltipOpen, setAutomationTooltipOpen] = React.useState(false);

  const applyTemplate = React.useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      if (templateId === "__none__") return;
      const template = filteredSavedConfigs.find((item) => item.id === templateId);
      if (!template) return;
      onApply(sanitizeRunConfig(template.config));
    },
    [filteredSavedConfigs, onApply],
  );

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

      {purpose === "interactive" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t("runConfig.savedConfig.label")}</span>
            <button
              type="button"
              onClick={handleOpenCodeAgentSettings}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
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

      <TerminalAgentModelPopover
        options={[{ id: agentId, label: agentLabel }]}
        agentId={agentId}
        runConfig={value}
        onRunConfigChange={(_agentId, next) => onApply(next)}
        agentLocked
        menuInline
      />

      {showActions ? (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onApply(null)}>
            {t("common.reset")}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
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
          onApply={onApply}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
