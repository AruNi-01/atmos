"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Bot, Check, ChevronDown, ChevronLeft, Settings2 } from "lucide-react";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { TerminalAgentRunConfigContent } from "@/features/agent/components/TerminalAgentRunConfigDialog";
import {
  buildRunConfigSummary,
  readSavedRunConfigs,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";

export interface TerminalAgentSelectorOption {
  id: string;
  label: string;
  description?: string | null;
  disabledReason?: string | null;
  iconType?: "built-in" | "custom";
}

function AgentGlyph({
  option,
  size = 16,
}: {
  option: TerminalAgentSelectorOption;
  size?: number;
}) {
  if (option.iconType === "custom") {
    return <Bot className={cn(size >= 18 ? "size-5" : "size-4", "text-muted-foreground")} />;
  }
  return <AgentIcon registryId={option.id} name={option.label} size={size} />;
}

type SharedProps = {
  options: readonly TerminalAgentSelectorOption[];
  value: string;
  onValueChange: (value: string) => void;
  onInteraction?: (event: React.SyntheticEvent) => void;
  purpose?: "interactive" | "automation";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type FloatingProps = SharedProps & {
  variant: "floating";
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
  runConfigByAgentId: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  triggerPlacement?: "notch" | "inline";
  contentAlign?: React.ComponentProps<typeof DropdownMenuContent>["align"];
};

type FieldProps = SharedProps & {
  variant: "field";
  className?: string;
  label?: string;
  helperText?: React.ReactNode;
  showRunConfig?: boolean;
  runConfig: TerminalAgentRunConfigInput | null | undefined;
  runConfigByAgentId?: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
};

type MenuProps = SharedProps & {
  variant: "menu";
  trigger: React.ReactNode;
  disabled?: boolean;
  runConfig: TerminalAgentRunConfigInput | null | undefined;
  runConfigByAgentId?: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
  onCloseAutoFocus?: React.ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
  onPointerDownOutside?: React.ComponentProps<typeof DropdownMenuContent>["onPointerDownOutside"];
  menuHeader?: React.ReactNode;
  menuFooter?: React.ReactNode;
  contentClassName?: string;
};

type TerminalAgentSelectorWithRunConfigProps =
  | FloatingProps
  | FieldProps
  | MenuProps;

type SelectorView = "agent_list" | "run_config";

export function TerminalAgentSelectorWithRunConfig(
  props: TerminalAgentSelectorWithRunConfigProps,
) {
  const t = useTranslations("Agent.components.selector");
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = props.open ?? uncontrolledOpen;
  const onOpenChange = props.onOpenChange;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );
  const [view, setView] = React.useState<SelectorView>("agent_list");
  const [configuringAgentId, setConfiguringAgentId] = React.useState<string | null>(null);
  const preserveConfigViewOnCloseRef = React.useRef(false);
  const settings = useFunctionSettingsStore((state) => state.settings);
  const loadFunctionSettings = useFunctionSettingsStore((state) => state.load);
  const allowRunConfig = props.variant !== "field" || props.showRunConfig !== false;

  React.useEffect(() => {
    void loadFunctionSettings();
  }, [loadFunctionSettings]);

  React.useEffect(() => {
    if (!open) {
      if (preserveConfigViewOnCloseRef.current) {
        preserveConfigViewOnCloseRef.current = false;
        return;
      }
      setView("agent_list");
      setConfiguringAgentId(null);
    }
  }, [open]);

  const savedRunConfigs = React.useMemo(
    () => readSavedRunConfigs(settings?.agent_cli?.saved_run_configs),
    [settings],
  );

  const options = props.options;
  const onInteraction = props.onInteraction;
  const selectedOption = options.find((item) => item.id === props.value) ?? null;
  const handleContentInteraction = React.useCallback(
    (event: React.SyntheticEvent) => {
      onInteraction?.(event);
      event.stopPropagation();
    },
    [onInteraction],
  );

  const getRunConfig = React.useCallback(
    (agentId: string) => {
      if (props.variant === "floating") {
        return props.runConfigByAgentId[agentId] ?? null;
      }
      if (props.runConfigByAgentId) {
        return props.runConfigByAgentId[agentId] ?? null;
      }
      return agentId === props.value ? (props.runConfig ?? null) : null;
    },
    [props],
  );

  const handleApply = React.useCallback(
    (value: TerminalAgentRunConfigInput | null) => {
      if (!configuringAgentId) return;
      props.onRunConfigChange(configuringAgentId, value);
      setView("agent_list");
      setConfiguringAgentId(null);
    },
    [configuringAgentId, props],
  );

  const handleAgentSelect = React.useCallback(
    (agentId: string) => {
      props.onValueChange(agentId);
      setOpen(false);
    },
    [props, setOpen],
  );

  const openRunConfig = React.useCallback((agentId: string) => {
    if (!allowRunConfig) return;
    setConfiguringAgentId(agentId);
    setView("run_config");
  }, [allowRunConfig]);

  const summary = selectedOption
    ? buildRunConfigSummary(selectedOption.label, getRunConfig(selectedOption.id))
    : t("selectAgent");

  const configAgent =
    options.find((item) => item.id === configuringAgentId) ??
    (configuringAgentId ? { id: configuringAgentId, label: configuringAgentId } : null);

  const listRows =
    options.length === 0 && props.variant === "floating" ? (
      <DropdownMenuItem onClick={props.onEmptyAction} className="cursor-pointer">
        {props.emptyActionLabel ?? t("connectAgents")}
      </DropdownMenuItem>
    ) : (
      <div className="grid gap-0.5">
        {options.map((option) => {
          const disabledReason = option.disabledReason?.trim();
          const selected = option.id === props.value;
          const configButton = (
            <button
              type="button"
              disabled={!!disabledReason}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!disabledReason) {
                  openRunConfig(option.id);
                }
              }}
              className="absolute inset-0 inline-flex items-center justify-center rounded-md text-muted-foreground opacity-0 pointer-events-none group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100 hover:bg-background hover:text-foreground"
              aria-label={t("configureAgent", { label: option.label })}
            >
              <Settings2 className="size-3.5" />
            </button>
          );

          const row = (
            <div
              key={option.id}
              className={cn(
                "group/agent flex items-center gap-1.5 rounded-md px-2 py-1",
                disabledReason ? "opacity-60" : "hover:bg-accent/70",
              )}
            >
              <button
                type="button"
                disabled={!!disabledReason}
                onClick={() => {
                  if (!disabledReason) {
                    handleAgentSelect(option.id);
                  }
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <AgentGlyph option={option} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{option.label}</span>
                  {option.description || disabledReason ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description ?? disabledReason}
                    </span>
                  ) : null}
                </span>
              </button>
              <span className="relative inline-flex size-7 shrink-0 items-center justify-center">
                {selected ? (
                  <Check className="size-4 text-foreground group-hover/agent:opacity-0 group-focus-within/agent:opacity-0" />
                ) : allowRunConfig ? (
                  <Settings2 className="size-3.5 text-muted-foreground group-hover/agent:opacity-0 group-focus-within/agent:opacity-0" />
                ) : null}
                {allowRunConfig ? configButton : null}
              </span>
            </div>
          );

          if (!disabledReason) {
            return row;
          }

          return (
            <Tooltip key={option.id}>
              <TooltipTrigger asChild>{row}</TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-5">
                {disabledReason}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );

  const listHeader =
    props.variant === "menu" && props.menuHeader ? (
      <>
        {props.menuHeader}
        <DropdownMenuSeparator />
      </>
    ) : null;

  const listFooter =
    props.variant === "menu" && props.menuFooter ? (
      <>
        <DropdownMenuSeparator />
        {props.menuFooter}
      </>
    ) : null;

  const overlayContent = (
    <div
      className={cn(
        "relative overflow-hidden transition-[width] duration-250 ease-out",
        view === "agent_list" ? "w-[272px]" : "w-[420px]",
      )}
    >
      <div
        className={cn(
          "transition-all duration-200 ease-out",
          view === "agent_list"
            ? "translate-x-0 opacity-100"
            : "-translate-x-3 opacity-0 pointer-events-none absolute inset-0",
        )}
      >
        {listHeader}
        {listRows}
        {listFooter}
      </div>

      <div
        className={cn(
          "transition-all duration-200 ease-out",
          view === "run_config"
            ? "translate-x-0 opacity-100"
            : "translate-x-3 opacity-0 pointer-events-none absolute inset-0",
        )}
      >
        {configAgent ? (
          <div className="space-y-3 px-2 py-2">
            <button
              type="button"
              onClick={() => {
                setView("agent_list");
                setConfiguringAgentId(null);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
              {t("back")}
            </button>
            <TerminalAgentRunConfigContent
              agentId={configAgent.id}
              agentLabel={configAgent.label}
              purpose={props.purpose ?? "interactive"}
              savedRunConfigs={savedRunConfigs}
              value={getRunConfig(configAgent.id)}
              onApply={handleApply}
              onManageConfigs={() => {
                preserveConfigViewOnCloseRef.current = true;
              }}
              onCancel={() => {
                setView("agent_list");
                setConfiguringAgentId(null);
              }}
              embedded
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  if (props.variant === "floating") {
    return (
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "z-20 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background text-foreground/90 shadow-[0_6px_20px_rgba(0,0,0,0.18)] backdrop-blur-sm hover:bg-accent hover:text-foreground",
                  props.triggerPlacement === "inline" ? "relative" : "absolute -left-3 -top-3",
                )}
                aria-label={t("selectAgent")}
              >
                {selectedOption ? (
                  <AgentGlyph option={selectedOption} size={18} />
                ) : (
                  <Bot className="size-4 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{summary}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align={props.contentAlign ?? "start"}
          className="p-1.5"
          onDoubleClick={handleContentInteraction}
          onKeyDown={handleContentInteraction}
          onMouseDown={handleContentInteraction}
          onPointerDown={handleContentInteraction}
          onWheel={handleContentInteraction}
        >
          {overlayContent}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (props.variant === "field") {
    return (
      <div className={props.className}>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.label ?? t("fieldLabel")}
        </label>
        <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none hover:bg-accent/40"
                >
                  {selectedOption ? <AgentGlyph option={selectedOption} /> : null}
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedOption?.label ?? t("selectAgent")}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {props.showRunConfig !== false ? (
              <TooltipContent side="top">{summary}</TooltipContent>
            ) : null}
          </Tooltip>
          <DropdownMenuContent
            align="start"
            className="p-1.5"
            onDoubleClick={handleContentInteraction}
            onKeyDown={handleContentInteraction}
            onMouseDown={handleContentInteraction}
            onPointerDown={handleContentInteraction}
            onWheel={handleContentInteraction}
          >
            {overlayContent}
          </DropdownMenuContent>
        </DropdownMenu>
        {props.helperText ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{props.helperText}</p>
        ) : null}
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{props.trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("p-1.5", props.contentClassName)}
        onCloseAutoFocus={props.onCloseAutoFocus}
        onDoubleClick={handleContentInteraction}
        onKeyDown={handleContentInteraction}
        onMouseDown={handleContentInteraction}
        onPointerDownOutside={props.onPointerDownOutside}
        onPointerDown={handleContentInteraction}
        onWheel={handleContentInteraction}
      >
        {overlayContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
