"use client";
// beui.dev/components/agents/prompt-input

import {
  ArrowUp,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
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
import { RangeSlider } from "../motion/range-slider";
import { Switch } from "../ui/switch";
import { SPRING_PRESS, SPRING_SWAP } from "../../lib/ease";
import { cn } from "../../lib/utils";
import {
  agentConfigFlyoutOffsetTop,
  agentConfigFlyoutSide,
  agentConfigTriggerText,
  initialAgentConfigFlyout,
  type AgentConfigFlyout,
} from "./prompt-input-view";

export interface PromptModel {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
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
  modeLocked?: string;
  permissionLocked?: string;
  search?: string;
  searchModels?: string;
  searchAgents?: string;
  back?: string;
  noResults?: string;
  loadingModels?: string;
  thinkingFaster?: string;
  thinkingSmarter?: string;
  thinkingEffort?: string;
  fastMode?: string;
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
  modelsLocked?: boolean;
  /** Fired when the model picker opens while the model list is empty. */
  onEmptyModelsOpen?: () => void;
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
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  header?: ReactNode;
  editor?: ReactNode;
  formRef?: Ref<HTMLFormElement>;
  canSubmit?: boolean;
  labels?: PromptInputLabels;
  className?: string;
  /** Shell corner radius. Inner toolbar controls scale with this. Default `2xl`. */
  radius?: PromptInputRadius;
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
  modeLocked: "This agent cannot switch modes in the current session",
  permissionLocked: "This agent cannot switch permission in the current session",
  search: "Search",
  searchModels: "Search models",
  searchAgents: "Search agents",
  back: "Agents",
  noResults: "No results",
  loadingModels: "Loading models",
  thinkingFaster: "Faster",
  thinkingSmarter: "Smarter",
  thinkingEffort: "Effort",
  fastMode: "Fast Tier",
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
  modelsLocked = false,
  onEmptyModelsOpen,
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
  actions = [],
  onAction,
  onSubmit,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  leadingAction,
  header,
  editor,
  formRef,
  canSubmit: canSubmitProp,
  labels: labelsProp,
  className,
  radius = "2xl",
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
            value={mode}
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
            value={permissionMode}
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
          {agents.length || models.length || thinkingLevels.length > 0 || fastAvailable || modelsLoading ? (
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
              onEmptyModelsOpen={onEmptyModelsOpen}
              currentAgent={currentAgent}
              currentModel={currentModel}
              thinkingLevels={thinkingLevels}
              thinking={thinking}
              onThinkingChange={onThinkingChange}
              fastAvailable={fastAvailable}
              fastEnabled={fastEnabled}
              onFastChange={onFastChange}
              disabled={disabled || loading}
              labels={labels}
              className="min-w-0"
              controlRadius={controlRadius}
            />
          ) : null}
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
  onEmptyModelsOpen,
  currentAgent,
  currentModel,
  thinkingLevels,
  thinking,
  onThinkingChange,
  fastAvailable,
  fastEnabled,
  onFastChange,
  disabled,
  labels,
  className,
  controlRadius,
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
  onEmptyModelsOpen?: () => void;
  currentAgent?: PromptModel;
  currentModel?: PromptModel;
  thinkingLevels: PromptModel[];
  thinking?: string;
  onThinkingChange?: (thinking: string) => void;
  fastAvailable?: boolean;
  fastEnabled?: boolean;
  onFastChange?: (enabled: boolean) => void;
  disabled?: boolean;
  labels: Required<PromptInputLabels>;
  className?: string;
  controlRadius: string;
}) {
  const [open, setOpen] = useState(false);
  const skipAgentList = agentLocked || agents.length === 0;
  const [flyout, setFlyout] = useState<AgentConfigFlyout | null>(
    initialAgentConfigFlyout({ skipAgentList, agent }),
  );
  const [search, setSearch] = useState("");
  const [flyoutSide, setFlyoutSide] = useState<"right" | "left">("right");
  const [flyoutOffsetTop, setFlyoutOffsetTop] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const hideFlyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showThinking = thinkingLevels.length > 1;
  const currentThinking = thinkingLevels.find((level) => level.value === thinking);
  const triggerText = agentConfigTriggerText({
    modelLabel: optionLabelText(currentModel),
    thinkingLabel: showThinking
      ? titleCaseLabel(optionLabelText(currentThinking ?? thinkingLevels[0]))
      : "",
    agentLabel: optionLabelText(currentAgent) || labels.chooseAgent,
  });
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || flyout !== "model") return models;
    return models.filter((option) => optionLabelText(option).toLowerCase().includes(q));
  }, [flyout, models, search]);
  const cancelHideFlyout = useCallback(() => {
    if (hideFlyoutTimer.current == null) return;
    clearTimeout(hideFlyoutTimer.current);
    hideFlyoutTimer.current = null;
  }, []);
  const scheduleHideFlyout = useCallback(() => {
    cancelHideFlyout();
    hideFlyoutTimer.current = setTimeout(() => {
      hideFlyoutTimer.current = null;
      setFlyout(null);
      setSearch("");
    }, 120);
  }, [cancelHideFlyout]);
  const openFlyout = (next: AgentConfigFlyout) => {
    cancelHideFlyout();
    if (next === "model" && modelsLocked) return;
    if (next === "model" && models.length === 0) {
      onEmptyModelsOpen?.();
    }
    if (next === flyout) return;
    setSearch("");
    setFlyout(next);
  };
  useEffect(() => {
    if (!modelsLocked || flyout !== "model") return;
    setFlyout(null);
    setSearch("");
  }, [flyout, modelsLocked]);
  useEffect(() => () => cancelHideFlyout(), [cancelHideFlyout]);
  useLayoutEffect(() => {
    if (!flyout || !menuRef.current) {
      setFlyoutSide("right");
      setFlyoutOffsetTop(0);
      return;
    }
    const update = () => {
      const menu = menuRef.current;
      const panel = flyoutRef.current;
      if (!menu || !panel) return;
      const rect = menu.getBoundingClientRect();
      setFlyoutSide(
        agentConfigFlyoutSide({
          menuRight: rect.right,
          viewportWidth: window.innerWidth,
        }),
      );
      setFlyoutOffsetTop(
        agentConfigFlyoutOffsetTop({
          menuTop: rect.top,
          flyoutHeight: panel.offsetHeight,
          viewportHeight: window.innerHeight,
        }),
      );
    };
    update();
    const panel = flyoutRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [flyout]);

  return (
    <MorphPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        cancelHideFlyout();
        setFlyout(null);
        setSearch("");
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
            <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5">
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
        <div
          ref={menuRef}
          className="relative w-[13.75rem]"
          onPointerLeave={scheduleHideFlyout}
        >
          <div className="flex w-full flex-col rounded-2xl border border-border bg-popover py-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
            {skipAgentList ? null : (
              <ConfigMenuRow
                label={labels.chooseAgent}
                value={optionLabelText(currentAgent) || labels.chooseAgent}
                active={flyout === "agent"}
                onHover={() => openFlyout("agent")}
              />
            )}
            <ConfigMenuRow
              label={labels.model}
              value={optionLabelText(currentModel) || labels.chooseModel}
              active={flyout === "model"}
              disabled={modelsLocked}
              title={modelsLocked ? labels.modelLocked : undefined}
              onHover={() => openFlyout("model")}
            />
            {showThinking ? (
              <div
                className="px-1 py-1"
                onPointerEnter={() => {
                  cancelHideFlyout();
                  setFlyout(null);
                  setSearch("");
                }}
              >
                <ThinkingSliderPanel
                  levels={thinkingLevels}
                  value={thinking}
                  onChange={onThinkingChange}
                  disabled={disabled}
                  effortLabel={labels.thinkingEffort}
                />
              </div>
            ) : null}
            {fastAvailable ? (
              <div
                className="px-1"
                onPointerEnter={() => {
                  cancelHideFlyout();
                  setFlyout(null);
                  setSearch("");
                }}
              >
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
          {flyout ? (
            <div
              className={cn(
                "absolute z-10",
                flyoutSide === "right" ? "left-full pl-1.5" : "right-full pr-1.5",
              )}
              style={{ top: flyoutOffsetTop }}
              onPointerEnter={cancelHideFlyout}
            >
              <div
                ref={flyoutRef}
                className="flex max-h-[min(20rem,calc(100dvh-1rem))] w-[16.5rem] flex-col rounded-2xl border border-border bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]"
              >
                {flyout === "agent" ? (
                  <ConfigFlyoutList
                    options={agents}
                    selected={agent}
                    emptyLabel={labels.noResults}
                    onSelect={(value) => {
                      onAgentChange?.(value);
                    }}
                  />
                ) : (
                  <ConfigFlyoutList
                    options={filteredModels}
                    selected={model}
                    search={search}
                    onSearch={setSearch}
                    searchPlaceholder={labels.searchModels}
                    loading={Boolean(modelsLoading) && models.length === 0}
                    loadingLabel={labels.loadingModels}
                    emptyLabel={labels.noResults}
                    onSelect={(value) => {
                      onModelChange(value);
                      setOpen(false);
                    }}
                    showSearch
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

function ConfigMenuRow({
  label,
  value,
  active,
  disabled,
  title,
  onHover,
}: {
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onHover: () => void;
}) {
  return (
    <div className="px-1">
      <button
        type="button"
        disabled={disabled}
        title={title}
        onPointerEnter={disabled ? undefined : onHover}
        onFocus={disabled ? undefined : onHover}
        onClick={disabled ? undefined : onHover}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none",
          disabled
            ? "cursor-not-allowed text-muted-foreground"
            : active
              ? "bg-muted text-foreground"
              : "text-foreground hover:bg-muted/60",
        )}
      >
        <span className="shrink-0 font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{value}</span>
        {disabled ? null : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />}
      </button>
    </div>
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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0 } : SPRING_SWAP}
      className="px-1.5 pt-1.5 pb-1"
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
        <span className="block truncate text-sm">{option.label}</span>
        {option.description ? (
          <span className="mt-0.5 block text-xs leading-4 opacity-70">
            {option.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function optionLabelText(option?: PromptModel): string {
  if (!option) return "";
  return typeof option.label === "string" ? option.label : option.value;
}
