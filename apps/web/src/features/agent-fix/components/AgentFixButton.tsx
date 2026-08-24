"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { AgentFixSettingsPopover } from "@/features/agent-fix/components/AgentFixSettingsPopover";
import { useAgentFixActions } from "@/features/agent-fix/hooks/use-agent-fix-actions";
import { useAgentFixConfig } from "@/features/agent-fix/hooks/use-agent-fix-config";
import type { AgentFixPromptSource } from "@/features/agent-fix/types";

export function AgentFixButton({
  appearance = "segmented",
  className,
  mode = "compact",
  onSettingsOpenChange,
  source,
}: {
  appearance?: "segmented" | "subtle";
  className?: string;
  mode?: "icon" | "label" | "compact";
  onSettingsOpenChange?: (open: boolean) => void;
  source: AgentFixPromptSource;
}) {
  const t = useTranslations("agent.fixButton");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const closeFromPointerOutsideRef = React.useRef(false);
  const {
    availableAgents,
    rememberSelectedAgent,
    runConfigByAgentId,
    selectedAgent,
    selectedAgentId,
    setRunConfigForAgent,
    setSelectedAgentId,
  } = useAgentFixConfig();
  const runConfig = selectedAgent ? runConfigByAgentId[selectedAgent.id] ?? null : null;
  const { isLaunching, launchAgentFix } = useAgentFixActions({
    agent: selectedAgent,
    rememberAgent: rememberSelectedAgent,
    runConfig,
    source,
  });
  const disabledReason = source.disabledReason?.trim();
  const disabled = !!disabledReason || !selectedAgent || isLaunching;
  const isSubtle = appearance === "subtle";
  const handleSettingsOpenChange = React.useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      onSettingsOpenChange?.(open);
    },
    [onSettingsOpenChange],
  );
  const handleSettingsPointerDownOutside = React.useCallback(() => {
    closeFromPointerOutsideRef.current = true;
  }, []);
  const handleSettingsCloseAutoFocus = React.useCallback((event: Event) => {
    if (!closeFromPointerOutsideRef.current) return;
    closeFromPointerOutsideRef.current = false;
    event.preventDefault();
    settingsTriggerRef.current?.blur();
  }, []);

  return (
    <span
      className={cn(
        isSubtle
          ? "inline-flex h-6 items-stretch overflow-hidden rounded-md border border-border/50 bg-background/70"
          : "inline-flex h-7 items-stretch overflow-hidden rounded-md border border-border/70 bg-background shadow-sm",
        className,
      )}
      data-agent-fix-settings-open={settingsOpen ? "true" : undefined}
      title={disabledReason || t("title")}
    >
      <AgentFixSettingsPopover
        agents={availableAgents}
        disabled={isLaunching}
        selectedAgentId={selectedAgentId}
        onSelectedAgentChange={setSelectedAgentId}
        open={settingsOpen}
        onOpenChange={handleSettingsOpenChange}
        onCloseAutoFocus={handleSettingsCloseAutoFocus}
        onPointerDownOutside={handleSettingsPointerDownOutside}
        runConfig={runConfig}
        runConfigByAgentId={runConfigByAgentId}
        onRunConfigChange={setRunConfigForAgent}
        triggerRef={settingsTriggerRef}
        className={cn(
          isSubtle
            ? "size-6 rounded-none border-0 border-r border-border/50 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            : "size-7 rounded-none border-0 border-r border-border/70",
        )}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          void launchAgentFix();
        }}
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50",
          isSubtle
            ? "h-6 rounded-none px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            : "px-2 text-xs text-foreground hover:bg-muted",
        )}
        aria-label={t("startAria")}
      >
        {isLaunching ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : selectedAgent ? (
          <AgentIcon registryId={selectedAgent.id} name={selectedAgent.label} size={14} />
        ) : (
          <Bot className="size-3.5" />
        )}
        {mode !== "icon" ? <span className="truncate">{t("label")}</span> : null}
      </button>
    </span>
  );
}
