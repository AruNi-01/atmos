"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Bot, Check, ChevronDown, ChevronLeft, Settings2 } from "lucide-react";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { TerminalAgentModelPopover } from "@/features/agent/components/TerminalAgentModelPopover";
import {
  buildRunConfigSummary,
  readSavedRunConfigs,
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import {
  pointerDownKeepsTerminalPickerOpen,
  terminalPickerClosesOnModelChoice,
} from "@/features/agent/lib/terminal-picker-dismiss";
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
  /** Default true. Attention summary passes false so terminal last-pick is not saved as behaviour. */
  hydrateLastPick?: boolean;
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

type PanelProps = SharedProps & {
  variant: "panel";
  className?: string;
  showRunConfig?: boolean;
  runConfig: TerminalAgentRunConfigInput | null | undefined;
  runConfigByAgentId?: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
};

type TerminalAgentSelectorWithRunConfigProps =
  | FloatingProps
  | FieldProps
  | MenuProps
  | PanelProps;

export function TerminalAgentSelectorWithRunConfig(
  props: TerminalAgentSelectorWithRunConfigProps,
) {
  const t = useTranslations("Agent.components.selector");
  const runConfigText = useTranslations("Agent.components.runConfig");
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
  const settings = useFunctionSettingsStore((state) => state.settings);
  const loadFunctionSettings = useFunctionSettingsStore((state) => state.load);
  const allowRunConfig =
    props.variant === "field" || props.variant === "panel"
      ? props.showRunConfig !== false
      : true;

  const [agentListOpen, setAgentListOpen] = React.useState(false);
  const [lockedAgentId, setLockedAgentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadFunctionSettings();
  }, [loadFunctionSettings]);

  React.useEffect(() => {
    if (open) return;
    setAgentListOpen(false);
    setLockedAgentId(null);
  }, [open]);

  const openRunConfig = React.useCallback((agentId: string) => {
    if (!allowRunConfig) return;
    setLockedAgentId(agentId);
    setAgentListOpen(false);
  }, [allowRunConfig]);

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

  const keepPickerOpenForEffortPopover = React.useCallback(
    (event: { preventDefault: () => void; target: EventTarget | null }) => {
      if (pointerDownKeepsTerminalPickerOpen(event.target)) event.preventDefault();
    },
    [],
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

  const summary = selectedOption
    ? buildRunConfigSummary(selectedOption.label, getRunConfig(selectedOption.id))
    : t("selectAgent");

  const pickerAgentId = lockedAgentId ?? props.value;
  const pickerLocked = lockedAgentId !== null;
  const pickerOption = options.find((item) => item.id === pickerAgentId)
    ?? (pickerAgentId ? { id: pickerAgentId, label: pickerAgentId } : null);
  const pickerOptions = pickerLocked && pickerOption ? [pickerOption] : options;
  const showAgentList = props.variant !== "panel" && allowRunConfig && agentListOpen && !pickerLocked;
  const barePicker = !showAgentList && !(options.length === 0 && props.variant === "floating");
  const menuSurface = barePicker
    ? "min-w-0 overflow-x-visible overflow-y-visible border-0 bg-transparent p-0 shadow-none"
    : "p-1.5";
  const agentTemplates = savedRunConfigs.filter((item) => item.agent_id === pickerAgentId);
  const showTemplates = allowRunConfig && props.purpose !== "automation" && agentTemplates.length > 0 && !showAgentList;

  const agentRows = (
    <div className="grid gap-0.5">
      <button
        type="button"
        onClick={() => setAgentListOpen(false)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {t("back")}
      </button>
      {options.map((option) => {
        const disabledReason = option.disabledReason?.trim();
        const selected = option.id === props.value;
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
                if (disabledReason) return;
                props.onValueChange(option.id);
                if (props.variant !== "panel") setOpen(false);
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
              ) : (
                <Settings2 className="size-3.5 text-muted-foreground group-hover/agent:opacity-0 group-focus-within/agent:opacity-0" />
              )}
              <button
                type="button"
                disabled={!!disabledReason}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!disabledReason) openRunConfig(option.id);
                }}
                className="absolute inset-0 inline-flex items-center justify-center rounded-md text-muted-foreground opacity-0 pointer-events-none group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100 hover:bg-background hover:text-foreground"
                aria-label={t("configureAgent", { label: option.label })}
              >
                <Settings2 className="size-3.5" />
              </button>
            </span>
          </div>
        );
        if (!disabledReason) return row;
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

  const picker =
    options.length === 0 && props.variant === "floating" ? (
      <DropdownMenuItem onClick={props.onEmptyAction} className="cursor-pointer">
        {props.emptyActionLabel ?? t("connectAgents")}
      </DropdownMenuItem>
    ) : showAgentList ? (
      agentRows
    ) : (
      <div className={cn("flex w-full min-w-[22rem] flex-col", (pickerLocked || showTemplates) && "gap-2")}>
        {pickerLocked ? (
          <button
            type="button"
            onClick={() => {
              setLockedAgentId(null);
              setAgentListOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/70 hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            {t("back")}
          </button>
        ) : null}
        {showTemplates ? (
          <Select
            onValueChange={(templateId) => {
              const template = agentTemplates.find((item) => item.id === templateId);
              if (!template || !pickerAgentId) return;
              props.onRunConfigChange(pickerAgentId, sanitizeRunConfig(template.config));
            }}
          >
            <SelectTrigger className="mx-1 h-8">
              <SelectValue placeholder={runConfigText("savedConfig.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {agentTemplates.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <TerminalAgentModelPopover
          options={pickerOptions}
          agentId={pickerAgentId}
          runConfig={pickerAgentId ? getRunConfig(pickerAgentId) : null}
          runConfigFor={getRunConfig}
          onRunConfigChange={props.onRunConfigChange}
          onSelectAgent={pickerLocked ? undefined : props.onValueChange}
          onModelChosen={(agentId) => {
            if (pickerLocked) return;
            props.onValueChange(agentId);
            if (terminalPickerClosesOnModelChoice() && props.variant !== "panel") setOpen(false);
          }}
          menuInline
          className={props.variant === "panel" ? undefined : "rounded-2xl bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]"}
          onOpenAgentList={
            props.variant !== "panel" && allowRunConfig && !pickerLocked
              ? () => setAgentListOpen(true)
              : undefined
          }
          agentLocked={pickerLocked}
          hydrateLastPick={props.hydrateLastPick}
        />
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
    <div className={cn("w-full", props.variant === "panel" ? "min-w-0" : "min-w-[22rem]")}>
      {listHeader}
      {picker}
      {listFooter}
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
          className={menuSurface}
          onDoubleClick={handleContentInteraction}
          onInteractOutside={keepPickerOpenForEffortPopover}
          onKeyDown={handleContentInteraction}
          onMouseDown={handleContentInteraction}
          onPointerDown={handleContentInteraction}
          onPointerDownOutside={keepPickerOpenForEffortPopover}
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
            className={menuSurface}
            onDoubleClick={handleContentInteraction}
            onInteractOutside={keepPickerOpenForEffortPopover}
            onKeyDown={handleContentInteraction}
            onMouseDown={handleContentInteraction}
            onPointerDown={handleContentInteraction}
            onPointerDownOutside={keepPickerOpenForEffortPopover}
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

  if (props.variant === "panel") {
    return (
      <div
        className={cn("max-h-[min(24rem,70vh)] overflow-auto", props.className)}
      >
        {overlayContent}
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{props.trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(menuSurface, props.contentClassName)}
        onCloseAutoFocus={props.onCloseAutoFocus}
        onDoubleClick={handleContentInteraction}
        onInteractOutside={keepPickerOpenForEffortPopover}
        onKeyDown={handleContentInteraction}
        onMouseDown={handleContentInteraction}
        onPointerDownOutside={(event) => {
          keepPickerOpenForEffortPopover(event);
          if (!pointerDownKeepsTerminalPickerOpen(event.target)) props.onPointerDownOutside?.(event);
        }}
        onPointerDown={handleContentInteraction}
        onWheel={handleContentInteraction}
      >
        {overlayContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
