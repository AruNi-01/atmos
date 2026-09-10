"use client";
// beui.dev/components/agents/prompt-input

import {
  ArrowUp,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../motion/button";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "../motion/popover-morph";
import {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
} from "../motion/tabs";
import { RangeSlider } from "../motion/range-slider";
import { Switch } from "../ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { SPRING_PRESS, SPRING_SWAP } from "../../lib/ease";
import { cn } from "../../lib/utils";
import {
  agentConfigTriggerText,
  contextModelSuffix,
  formatModelProviderLabel,
  groupedPromptModelRows,
  modelEffortTriggerLabel,
  modelLabelWithContext,
} from "./prompt-input-view";

export interface PromptModel {
  value: string;
  label: ReactNode;
  /** Provider / source shown as a section header in the model list. */
  group?: string;
  /** Credit multiplier shown after the model name (`2x`). */
  multiplier?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Chip shown immediately after the option label (e.g. Native / ACP). */
  trailing?: ReactNode;
  disabled?: boolean;
  tone?: "warning";
}

export interface PromptAction {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptInputLabels {
  chooseModel?: string;
  chooseAgent?: string;
  chooseMode?: string;
  choosePermission?: string;
  model?: string;
  modelLocked?: string;
  agentLocked?: string;
  modeLocked?: string;
  permissionLocked?: string;
  search?: string;
  searchModels?: string;
  searchAgents?: string;
  back?: string;
  noResults?: string;
  loadingModels?: string;
  /** Reload the model catalog when switching agents leaves it empty. */
  loadModels?: string;
  /** Force a live model catalog probe even when the cache is still fresh. */
  reloadModels?: string;
  thinkingFaster?: string;
  thinkingSmarter?: string;
  thinkingEffort?: string;
  fastMode?: string;
  /** Short Fast chip word, e.g. `Low · Fast`. */
  fastChip?: string;
  context?: string;
}

export type PromptInputRadius = "2xl" | "3xl";

export interface PromptInputProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSubmit" | "children"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  models?: PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  modelsLoading?: boolean;
  /** True while a user-initiated catalog reload is in flight. */
  modelsReloading?: boolean;
  modelsLocked?: boolean;
  /** Fired when the model picker opens while the model list is empty. */
  onEmptyModelsOpen?: () => void;
  /** Fired when the user asks to reload the model catalog. */
  onLoadModels?: () => void;
  agents?: PromptModel[];
  agent?: string;
  onAgentChange?: (agent: string) => void;
  agentLocked?: boolean;
  modes?: PromptModel[];
  mode?: string;
  onModeChange?: (mode: string) => void;
  modesLocked?: boolean;
  permissionModes?: PromptModel[];
  permissionMode?: string;
  onPermissionModeChange?: (mode: string) => void;
  permissionModesLocked?: boolean;
  thinkingLevels?: PromptModel[];
  thinking?: string;
  onThinkingChange?: (thinking: string) => void;
  /** Show Fast switch when the agent advertises a `fast` config option. */
  fastAvailable?: boolean;
  fastEnabled?: boolean;
  onFastChange?: (enabled: boolean) => void;
  contextLevels?: PromptModel[];
  context?: string;
  onContextChange?: (context: string) => void;
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  /** Rendered in the footer immediately before the submit/stop button (e.g. context window). */
  footerTrailing?: ReactNode;
  header?: ReactNode;
  editor?: ReactNode;
  formRef?: Ref<HTMLFormElement>;
  canSubmit?: boolean;
  labels?: PromptInputLabels;
  className?: string;
  /** Shell corner radius. Inner toolbar controls scale with this. Default `2xl`. */
  radius?: PromptInputRadius;
  /** Optional left rail for the agent/model picker (e.g. vertical CenterStage tabs). */
  agentTablist?: ReactNode;
}

const PROMPT_SHELL_RADIUS: Record<PromptInputRadius, string> = {
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
};

const PROMPT_CONTROL_RADIUS: Record<PromptInputRadius, string> = {
  "2xl": "rounded-xl",
  "3xl": "rounded-2xl",
};

const DEFAULT_LABELS: Required<PromptInputLabels> = {
  chooseModel: "Choose model",
  chooseAgent: "Agent",
  chooseMode: "Mode",
  choosePermission: "Permission",
  model: "Model",
  modelLocked: "This agent cannot switch models in the current session",
  agentLocked: "This session cannot switch agents",
  modeLocked: "This agent cannot switch modes in the current session",
  permissionLocked: "This agent cannot switch permission in the current session",
  search: "Search",
  searchModels: "Search models",
  searchAgents: "Search agents",
  back: "Agents",
  noResults: "No results",
  loadingModels: "Loading models",
  loadModels: "Load",
  reloadModels: "Reload models",
  thinkingFaster: "Faster",
  thinkingSmarter: "Smarter",
  thinkingEffort: "Effort",
  fastMode: "Fast Tier",
  fastChip: "Fast",
  context: "Context",
};

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  modelsLoading = false,
  modelsReloading = false,
  modelsLocked = false,
  onEmptyModelsOpen,
  onLoadModels,
  agents = [],
  agent,
  onAgentChange,
  agentLocked = false,
  modes = [],
  mode,
  onModeChange,
  modesLocked = false,
  permissionModes = [],
  permissionMode,
  onPermissionModeChange,
  permissionModesLocked = false,
  thinkingLevels = [],
  thinking,
  onThinkingChange,
  fastAvailable = false,
  fastEnabled = false,
  onFastChange,
  contextLevels = [],
  context,
  onContextChange,
  actions = [],
  onAction,
  onSubmit,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  leadingAction,
  footerTrailing,
  header,
  editor,
  formRef,
  canSubmit: canSubmitProp,
  labels: labelsProp,
  className,
  radius = "2xl",
  agentTablist,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(
    defaultModel ?? models[0]?.value,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find(
    (option) => option.value === currentModelValue,
  );
  const currentAgent = agents.find((option) => option.value === agent);
  const canSubmit =
    canSubmitProp ?? (Boolean(currentValue.trim()) && !disabled && !loading);
  const shellRadius = PROMPT_SHELL_RADIUS[radius];
  const controlRadius = PROMPT_CONTROL_RADIUS[radius];

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const measurement = measurementRef.current;
    if (!textarea || !measurement || textarea.value !== currentValue) return;

    const lineHeight = 24;
    const nextHeight = Math.min(
      Math.max(measurement.scrollHeight, minRows * lineHeight),
      maxRows * lineHeight,
    );
    const height = `${nextHeight}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
  }, [currentValue, maxRows, minRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const setModel = (next: string) => {
    if (model === undefined) setInternalModel(next);
    onModelChange?.(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit || disabled || loading) return;

    onSubmit?.(currentValue.trim(), currentModelValue);
    if (value === undefined) setInternalValue("");
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className={cn(
        "relative w-full overflow-visible border border-foreground/10 bg-foreground/[0.04] p-2",
        shellRadius,
        disabled && "opacity-60",
        className,
      )}
    >
      {header}
      {editor ? (
        <div className="px-2 pt-1.5">{editor}</div>
      ) : (
        <>
          <div
            ref={measurementRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-x-2 top-0 whitespace-pre-wrap px-2 text-sm leading-6 [overflow-wrap:break-word]"
          >
            {`${currentValue}\u200b`}
          </div>
          <textarea
            ref={textareaRef}
            value={currentValue}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={ariaLabel}
            rows={minRows}
            {...textareaProps}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            className="scrollbar-hide block w-full resize-none overflow-y-auto bg-transparent px-2 pt-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/55"
          />
        </>
      )}

      <div className="mt-1 flex min-h-8 items-center gap-1">
        {actions.length ? (
          <MorphPopover open={actionsOpen} onOpenChange={setActionsOpen}>
            <MorphPopoverTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || loading}
                aria-label="Add to prompt"
                className="size-8 rounded-full"
              >
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: actionsOpen ? 45 : 0 }}
                  transition={reduce ? { duration: 0 } : SPRING_SWAP}
                >
                  <Plus className="size-4" />
                </motion.span>
              </Button>
            </MorphPopoverTrigger>

            <MorphPopoverContent
              side="top"
              align="start"
              sideOffset={8}
              radius={12}
              className="w-56 p-1.5"
            >
              {actions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    onAction?.(action.value);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {action.icon ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                      {action.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {action.label}
                    </span>
                    {action.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {action.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </MorphPopoverContent>
          </MorphPopover>
        ) : null}
        {leadingAction}
        {modes.length ? (
          <PromptOptionSelect
            options={modes}
            value={mode ?? ""}
            onChange={onModeChange}
            disabled={disabled || loading || modesLocked}
            lockedHint={modesLocked ? labels.modeLocked : undefined}
            placeholder={labels.chooseMode}
            searchPlaceholder={labels.search}
            emptyLabel={labels.noResults}
            controlRadius={controlRadius}
          />
        ) : null}
        {permissionModes.length ? (
          <PromptOptionSelect
            options={permissionModes}
            value={permissionMode ?? ""}
            onChange={onPermissionModeChange}
            disabled={disabled || loading || permissionModesLocked}
            lockedHint={permissionModesLocked ? labels.permissionLocked : undefined}
            placeholder={labels.choosePermission}
            searchPlaceholder={labels.search}
            emptyLabel={labels.noResults}
            controlRadius={controlRadius}
          />
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {agents.length || models.length || thinkingLevels.length > 0 || fastAvailable || contextLevels.length > 1 || modelsLoading ? (
            <PromptAgentConfigMenu
              agents={agents}
              agent={agent}
              agentLocked={agentLocked}
              onAgentChange={onAgentChange}
              models={models}
              model={currentModelValue}
              onModelChange={setModel}
              modelsLocked={modelsLocked}
              modelsLoading={modelsLoading}
              modelsReloading={modelsReloading}
              onEmptyModelsOpen={onEmptyModelsOpen}
              onLoadModels={onLoadModels}
              currentAgent={currentAgent}
              currentModel={currentModel}
              thinkingLevels={thinkingLevels}
              thinking={thinking}
              onThinkingChange={onThinkingChange}
              fastAvailable={fastAvailable}
              fastEnabled={fastEnabled}
              onFastChange={onFastChange}
              contextLevels={contextLevels}
              context={context}
              onContextChange={onContextChange}
              disabled={disabled || loading}
              labels={labels}
              className="min-w-0"
              controlRadius={controlRadius}
              agentTablist={agentTablist}
            />
          ) : null}
          {footerTrailing}
        </div>

        <Button
          type={loading ? "button" : "submit"}
          size="icon"
          disabled={loading ? !onStop : !canSubmit}
          aria-label={loading ? "Stop generating" : "Send prompt"}
          onClick={loading ? onStop : undefined}
          className="size-8 rounded-full"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={loading ? "stop" : "send"}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="grid place-items-center"
            >
              {loading ? (
                <Square className="size-3 fill-current" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}

function PromptOptionSelect({
  options,
  value,
  onChange,
  disabled,
  lockedHint,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  controlRadius,
}: {
  options: PromptModel[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  lockedHint?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  controlRadius: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Never show the empty placeholder when options exist — preselect the first
  // listed value (composer also resolves aliases / currentValue before this).
  const current =
    options.find((option) => option.value === value) ?? options[0];
  const effectiveValue = current?.value ?? value ?? "";
  const showSearch = options.length > 15;
  const warning = current?.tone === "warning";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => optionLabelText(option).toLowerCase().includes(q));
  }, [options, search]);

  return (
    <MorphPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
      className="min-w-0"
    >
      <MorphPopoverTrigger>
        <button
          type="button"
          disabled={disabled}
          title={lockedHint || optionLabelText(current) || placeholder}
          className={cn(
            "inline-flex h-8 max-w-44 items-center gap-1.5 border-0 bg-transparent px-2 py-0 text-xs outline-none hover:bg-muted focus-visible:ring-2",
            warning
              ? "text-warning hover:text-warning"
              : "text-muted-foreground hover:text-foreground",
            open && (warning ? "bg-muted text-warning" : "bg-muted text-foreground"),
            controlRadius,
          )}
        >
          {current?.icon ? (
            <span className="grid size-4 shrink-0 place-items-center text-current [&_svg]:size-3.5">
              {current.icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{current?.label ?? placeholder}</span>
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        side="top"
        align="start"
        sideOffset={8}
        radius={16}
        clip={false}
        className="overflow-visible border-0 bg-transparent p-0"
      >
        <div className="flex max-h-[min(20rem,calc(100dvh-1rem))] w-[16.5rem] flex-col rounded-2xl border border-border bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
          <ConfigFlyoutList
            options={filtered}
            selected={effectiveValue}
            search={search}
            onSearch={setSearch}
            showSearch={showSearch}
            searchPlaceholder={searchPlaceholder}
            emptyLabel={emptyLabel}
            onSelect={(next) => {
              onChange?.(next);
              setOpen(false);
              setSearch("");
            }}
          />
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

function PromptAgentConfigMenu({
  agents,
  agent,
  agentLocked,
  onAgentChange,
  models,
  model,
  onModelChange,
  modelsLocked,
  modelsLoading,
  modelsReloading,
  onEmptyModelsOpen,
  onLoadModels,
  currentAgent,
  currentModel,
  thinkingLevels,
  thinking,
  onThinkingChange,
  fastAvailable,
  fastEnabled,
  onFastChange,
  contextLevels,
  context,
  onContextChange,
  disabled,
  labels,
  className,
  controlRadius,
  agentTablist,
}: {
  agents: PromptModel[];
  agent?: string;
  agentLocked?: boolean;
  onAgentChange?: (agent: string) => void;
  models: PromptModel[];
  model?: string;
  onModelChange: (model: string) => void;
  modelsLocked?: boolean;
  modelsLoading?: boolean;
  modelsReloading?: boolean;
  onEmptyModelsOpen?: () => void;
  onLoadModels?: () => void;
  currentAgent?: PromptModel;
  currentModel?: PromptModel;
  thinkingLevels: PromptModel[];
  thinking?: string;
  onThinkingChange?: (thinking: string) => void;
  fastAvailable?: boolean;
  fastEnabled?: boolean;
  onFastChange?: (enabled: boolean) => void;
  contextLevels: PromptModel[];
  context?: string;
  onContextChange?: (context: string) => void;
  disabled?: boolean;
  labels: Required<PromptInputLabels>;
  className?: string;
  controlRadius: string;
  agentTablist?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const skipAgentList = agents.length === 0;
  const [search, setSearch] = useState("");
  const [effortOpen, setEffortOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const showThinking = thinkingLevels.length > 1;
  const showContext = contextLevels.length > 1;
  const currentThinking = thinkingLevels.find((level) => level.value === thinking);
  const currentContext = contextLevels.find((level) => level.value === context)
    ?? contextLevels.find((level) => level.value === contextLevels[0]?.value)
    ?? contextLevels[0];
  const thinkingLabel = showThinking
    ? titleCaseLabel(optionLabelText(currentThinking ?? thinkingLevels[0]))
    : "";
  const contextLabel = showContext ? optionLabelText(currentContext) : "";
  const contextSuffix = showContext ? contextModelSuffix(contextLabel, context) : "";
  const showEffortControls = showThinking || fastAvailable || showContext;
  const effortLabel = modelEffortTriggerLabel({
    thinkingLabel,
    fastAvailable,
    fastEnabled,
    fastLabel: labels.fastChip,
  }) || contextLabel;
  const triggerText = agentConfigTriggerText({
    modelLabel: optionName(currentModel),
    contextLabel: contextSuffix,
    thinkingLabel,
    agentLabel: optionName(currentAgent) || labels.chooseAgent,
  });
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((option) => optionSearchText(option).toLowerCase().includes(q));
  }, [models, search]);
  const groupedModels = useMemo(
    () => groupedPromptModelRows(filteredModels),
    [filteredModels],
  );
  const selectedAgent = agent || agents[0]?.value || "";

  useEffect(() => {
    setSearch("");
  }, [agent]);
  useEffect(() => {
    setEffortOpen(false);
    setContextOpen(false);
  }, [agent, model]);

  return (
    <MorphPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
        setEffortOpen(false);
        setContextOpen(false);
        if (next && models.length === 0) {
          onEmptyModelsOpen?.();
        }
      }}
      className={className}
    >
      <MorphPopoverTrigger>
        <button
          type="button"
          disabled={disabled}
          title={triggerText}
          className={cn(
            "inline-flex h-8 max-w-[22rem] items-center gap-1.5 border-0 bg-transparent px-2 py-0 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2",
            open && "bg-muted text-foreground",
            controlRadius,
          )}
        >
          {(currentAgent?.icon ?? currentModel?.icon) ? (
            <span className="grid size-4 shrink-0 place-items-center overflow-hidden text-muted-foreground [&_img]:size-3.5 [&_svg]:size-3.5">
              {currentAgent?.icon ?? currentModel?.icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{triggerText}</span>
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        side="top"
        align="end"
        sideOffset={8}
        radius={16}
        clip={false}
        className="overflow-visible border-0 bg-transparent p-0"
      >
        <div className="flex max-h-[min(24rem,calc(100dvh-1rem))] overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
          {agentTablist !== undefined ? (
            agentTablist ? (
              <div className="flex min-h-0 shrink-0 items-stretch self-stretch p-1.5 pr-1">
                {agentTablist}
              </div>
            ) : null
          ) : skipAgentList ? null : (
            <div
              className={cn(
                "flex min-h-0 shrink-0 items-stretch self-stretch p-1.5 pr-1",
                agentLocked && "opacity-40",
              )}
            >
              <MotionTabs
                value={selectedAgent}
                onValueChange={
                  agentLocked
                    ? undefined
                    : (value) => {
                        onAgentChange?.(value);
                        setSearch("");
                        setEffortOpen(false);
                      }
                }
                variant="pill"
                orientation="vertical"
                className="flex h-full min-h-0 min-w-0 flex-col items-stretch"
              >
                <MotionTabsList
                  className="flex h-full w-11 min-h-0 max-h-full flex-col items-center justify-start overflow-y-auto bg-[color-mix(in_oklab,var(--popover),black_10%)] p-1"
                  indicatorClassName="bg-active"
                >
                  {agents.map((option) => {
                    const label = optionLabelText(option);
                    return (
                      <Tooltip key={option.value}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <MotionTabsTrigger
                              value={option.value}
                              disabled={option.disabled || agentLocked}
                              aria-label={label}
                              title={agentLocked ? labels.agentLocked : label}
                              className="pointer-events-auto group size-9 shrink-0 px-0 text-xs aria-selected:!text-foreground"
                            >
                              {option.icon ?? (
                                <span className="text-[10px] font-medium">{label.slice(0, 1)}</span>
                              )}
                            </MotionTabsTrigger>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="z-[10000]">
                          {agentLocked ? (
                            labels.agentLocked
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {label}
                              {option.trailing}
                            </span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </MotionTabsList>
              </MotionTabs>
            </div>
          )}
          <div className="flex min-h-0 w-[16.5rem] min-w-0 flex-1 flex-col">
            {models.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1 px-2 pt-1.5 pb-1">
                <div className="min-w-0 flex-1">
                  <SelectSearch
                    value={search}
                    onChange={setSearch}
                    placeholder={labels.searchModels}
                    padded={false}
                  />
                </div>
                {onLoadModels ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={labels.reloadModels}
                        disabled={disabled || modelsReloading}
                        onClick={() => onLoadModels()}
                        className="grid size-7 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {modelsReloading ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="z-[10000]">
                      {labels.reloadModels}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto p-1.5",
                models.length > 0 && "pt-0",
              )}
            >
              {Boolean(modelsLoading) && models.length === 0 ? (
                <div
                  className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  <span>{labels.loadingModels}</span>
                </div>
              ) : models.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-2.5 py-3">
                  <div className="text-center text-xs text-muted-foreground">
                    {labels.noResults}
                  </div>
                  {onLoadModels ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onLoadModels()}
                      className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {labels.loadModels}
                    </button>
                  ) : null}
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  {labels.noResults}
                </div>
              ) : (
                groupedModels.map((row) => {
                  if (row.type === "header") {
                    return (
                      <div
                        key={`group:${row.label}`}
                        className="px-2.5 pt-2 pb-0.5 text-xs text-muted-foreground"
                      >
                        {row.label}
                      </div>
                    );
                  }
                  const option = row.option;
                  const isSelected = option.value === model;
                  const warning = isSelected && option.tone === "warning";
                  const fullLabel = modelLabelWithContext(optionName(option), isSelected ? contextSuffix : "");
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "flex w-full items-center gap-1 rounded-lg",
                        warning
                          ? "bg-muted text-warning"
                          : isSelected
                            ? "bg-muted text-foreground"
                            : "text-foreground hover:bg-muted/70",
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={option.disabled || modelsLocked}
                            onClick={() => onModelChange(option.value)}
                            className={cn(
                              "flex min-w-0 flex-1 gap-2 px-2.5 py-2 text-left text-sm outline-none",
                              option.description ? "items-start" : "items-center",
                              "disabled:pointer-events-none disabled:opacity-50",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <OptionRow
                                option={
                                  isSelected && contextSuffix
                                    ? { ...option, label: modelLabelWithContext(optionName(option), contextSuffix) }
                                    : option
                                }
                              />
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[10000] max-w-xs">
                          {modelsLocked ? labels.modelLocked : fullLabel}
                        </TooltipContent>
                      </Tooltip>
                      {isSelected && showEffortControls ? (
                        <MorphPopover
                          open={effortOpen}
                          onOpenChange={(next) => {
                            setEffortOpen(next);
                            if (!next) setContextOpen(false);
                          }}
                          className="shrink-0"
                        >
                          <MorphPopoverTrigger>
                            <button
                              type="button"
                              disabled={disabled}
                              aria-label={effortLabel || labels.thinkingEffort}
                              className="inline-flex h-6 max-w-[10rem] shrink-0 items-center gap-0.5 rounded-full bg-foreground/10 px-2 text-[11px] text-muted-foreground outline-none hover:bg-foreground/15 hover:text-foreground focus-visible:ring-2"
                            >
                              <span className="min-w-0 truncate">{effortLabel}</span>
                              <ChevronRight className="size-3 shrink-0" />
                            </button>
                          </MorphPopoverTrigger>
                          <MorphPopoverContent
                            side="top"
                            align="end"
                            sideOffset={8}
                            radius={16}
                            clip={false}
                            className="overflow-visible border-0 bg-transparent p-0"
                          >
                            <div className="w-[13.75rem] rounded-2xl border border-border bg-popover py-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
                              {showContext ? (
                                <div className="px-1">
                                  <MorphPopover
                                    open={contextOpen}
                                    onOpenChange={setContextOpen}
                                    className="flex w-full"
                                  >
                                    <MorphPopoverTrigger>
                                      <button
                                        type="button"
                                        disabled={disabled}
                                        className="flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-2.5 text-left outline-none hover:bg-muted/70 focus-visible:ring-2"
                                      >
                                        <span className="shrink-0 text-sm font-medium text-foreground">
                                          {labels.context}
                                        </span>
                                        <span className="min-w-0 flex-1" />
                                        <span className="min-w-0 truncate text-sm text-muted-foreground">
                                          {contextLabel}
                                        </span>
                                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                                      </button>
                                    </MorphPopoverTrigger>
                                    <MorphPopoverContent
                                      side="right"
                                      align="start"
                                      sideOffset={8}
                                      radius={16}
                                      clip={false}
                                      className="overflow-visible border-0 bg-transparent p-0"
                                    >
                                      <div className="w-[9.5rem] rounded-2xl border border-border bg-popover p-1 shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
                                        {contextLevels.map((level) => {
                                          const isSelected = level.value === (context || currentContext?.value);
                                          return (
                                            <button
                                              key={level.value}
                                              type="button"
                                              disabled={disabled}
                                              onClick={() => {
                                                onContextChange?.(level.value);
                                                setContextOpen(false);
                                              }}
                                              className={cn(
                                                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none",
                                                isSelected
                                                  ? "bg-muted text-foreground"
                                                  : "text-foreground hover:bg-muted/70",
                                                "disabled:pointer-events-none disabled:opacity-50",
                                              )}
                                            >
                                              <span className="min-w-0 flex-1 truncate">
                                                {optionLabelText(level)}
                                              </span>
                                              {isSelected ? (
                                                <Check className="size-3.5 shrink-0" />
                                              ) : (
                                                <span className="size-3.5 shrink-0" />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </MorphPopoverContent>
                                  </MorphPopover>
                                </div>
                              ) : null}
                              {showThinking ? (
                                <div className="px-1 py-1">
                                  <ThinkingSliderPanel
                                    levels={thinkingLevels}
                                    value={thinking ?? ""}
                                    onChange={onThinkingChange}
                                    disabled={disabled}
                                    effortLabel={labels.thinkingEffort}
                                  />
                                </div>
                              ) : null}
                              {fastAvailable ? (
                                <div className="px-1">
                                  <div className="flex h-9 w-full items-center gap-3 px-2.5">
                                    <span className="shrink-0 text-sm font-medium text-foreground">
                                      {labels.fastMode}
                                    </span>
                                    <span className="min-w-0 flex-1" />
                                    <Switch
                                      checked={Boolean(fastEnabled)}
                                      disabled={disabled}
                                      onCheckedChange={(checked) => onFastChange?.(checked)}
                                      aria-label={labels.fastMode}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </MorphPopoverContent>
                        </MorphPopover>
                      ) : null}
                      <span
                        aria-hidden
                        className={cn(
                          "mr-2 size-3.5 shrink-0 rounded-full border",
                          isSelected
                            ? "border-foreground bg-foreground"
                            : "border-muted-foreground/35",
                        )}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

function ConfigFlyoutList({
  options,
  selected,
  search = "",
  onSearch,
  showSearch = false,
  heading,
  searchPlaceholder = "",
  loading = false,
  loadingLabel = "",
  emptyLabel,
  onSelect,
}: {
  options: PromptModel[];
  selected?: string;
  search?: string;
  onSearch?: (value: string) => void;
  showSearch?: boolean;
  heading?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {heading ? (
        <div className="px-3.5 pt-2.5 pb-0.5 text-[11px] text-muted-foreground">
          {heading}
        </div>
      ) : null}
      {showSearch ? (
        <SelectSearch
          value={search}
          onChange={onSearch ?? (() => {})}
          placeholder={searchPlaceholder}
        />
      ) : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", (showSearch || heading) && "pt-0")}>
        {loading ? (
          <div
            className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground"
            aria-busy="true"
            aria-live="polite"
          >
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            <span>{loadingLabel}</span>
          </div>
        ) : options.length === 0 ? (
          <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          options.map((option) => {
            const isSelected = option.value === selected;
            const warning = isSelected && option.tone === "warning";
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => onSelect(option.value)}
                className={cn(
                  "flex w-full gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                  option.description ? "items-start" : "items-center",
                  warning
                    ? "bg-muted text-warning"
                    : isSelected
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/70",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <OptionRow option={option} />
                </span>
                {isSelected ? (
                  <Check className={cn("size-3.5 shrink-0 text-current", option.description && "mt-0.5")} />
                ) : (
                  <span className={cn("size-3.5 shrink-0", option.description && "mt-0.5")} />
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function ThinkingSliderPanel({
  levels,
  value,
  onChange,
  disabled,
  effortLabel,
}: {
  levels: PromptModel[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  effortLabel: string;
}) {
  const propIndex = Math.max(
    0,
    levels.findIndex((level) => level.value === value),
  );
  const [index, setIndex] = useState(propIndex);
  useEffect(() => {
    setIndex(propIndex);
  }, [propIndex]);
  const current = levels[index] ?? levels[0];
  const max = Math.max(0, levels.length - 1);
  const currentLabel = titleCaseLabel(optionLabelText(current));

  return (
    <div>
      <div className="flex w-full items-center gap-3 px-2.5 py-2 text-sm">
        <span className="shrink-0 font-medium text-foreground">{effortLabel}</span>
        <FadeLabel
          value={currentLabel}
          className="min-w-0 flex-1 truncate text-right text-muted-foreground"
        />
      </div>
      <div className="px-2.5 pb-1">
        <RangeSlider
          variant="effort"
          min={0}
          max={max}
          step={1}
          value={index}
          disabled={disabled}
          maxEffect
          aria-label={currentLabel || effortLabel}
          formatValueText={(next) => titleCaseLabel(optionLabelText(levels[next] ?? current))}
          onValueChange={setIndex}
          onValueCommit={(next) => {
            const level = levels[next];
            if (level) onChange?.(level.value);
          }}
        />
      </div>
    </div>
  );
}

function FadeLabel({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span className={cn("relative inline-grid min-w-0 overflow-hidden", className)}>
      <span className="invisible col-start-1 row-start-1 truncate">{value}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={reduce ? { duration: 0.12 } : SPRING_SWAP}
          className="col-start-1 row-start-1 truncate will-change-[opacity,filter,transform]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function titleCaseLabel(value: string) {
  if (!value) return value;
  if (value !== value.toLowerCase()) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SelectSearch({
  value,
  onChange,
  placeholder,
  padded = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  padded?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0 } : SPRING_SWAP}
      className={padded ? "px-1.5 pt-1.5 pb-1" : undefined}
    >
      <motion.div
        animate={{ scale: focused ? 1.015 : 1 }}
        transition={reduce ? { duration: 0 } : SPRING_PRESS}
        className={cn(
          "flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors",
          focused ? "bg-muted" : "bg-muted/60",
        )}
      >
        <motion.span
          aria-hidden
          animate={{
            opacity: focused || value ? 1 : 0.45,
            scale: focused ? 1.08 : 1,
            rotate: focused ? -8 : 0,
          }}
          transition={reduce ? { duration: 0 } : SPRING_PRESS}
          className="text-muted-foreground"
        >
          <Search className="size-3.5" />
        </motion.span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.preventDefault();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
        <AnimatePresence initial={false}>
          {value ? (
            <motion.button
              type="button"
              key="clear"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={reduce ? { duration: 0.12 } : SPRING_PRESS}
              aria-label="Clear"
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onChange("")}
            >
              <X className="size-3" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function OptionRow({ option }: { option: PromptModel }) {
  const multiplier = option.multiplier?.trim() ?? "";
  return (
    <span className={cn("flex min-w-0 gap-2", option.description ? "items-start" : "items-center")}>
      {option.icon ? (
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center text-current [&_svg]:size-4",
            option.description && "mt-0.5",
          )}
        >
          {option.icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm">
            {option.label}
          </span>
          {multiplier ? (
            <span className="shrink-0 text-sm text-muted-foreground">{multiplier}</span>
          ) : null}
          {option.trailing ? (
            <span className="shrink-0">{option.trailing}</span>
          ) : null}
        </span>
        {option.description ? (
          <span className="mt-0.5 block text-xs leading-4 opacity-70">
            {option.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function optionName(option?: PromptModel): string {
  if (!option) return "";
  return typeof option.label === "string" ? option.label : option.value;
}

function optionSearchText(option: PromptModel): string {
  return [optionName(option), option.group, option.multiplier]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" ");
}

function optionLabelText(option?: PromptModel): string {
  if (!option) return "";
  return formatModelProviderLabel(optionName(option), option.group);
}
