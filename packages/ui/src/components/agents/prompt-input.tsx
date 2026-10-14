"use client";
// beui.dev/components/agents/prompt-input

import { ArrowUp, Plus, Square } from "lucide-react";
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
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "../motion/popover-morph";
import { SPRING_SWAP } from "../../lib/ease";
import { cn } from "../../lib/utils";
import {
  ConfigFlyoutList,
  PromptAgentConfigMenu,
  optionLabelText,
} from "./prompt-agent-config-menu";

export interface PromptModel {
  value: string;
  label: ReactNode;
  /** Provider / source shown as a section header in the model list. */
  group?: string;
  /** Optional icon shown before the group header (e.g. agent icon in favorites). */
  groupIcon?: ReactNode;
  /** Credit multiplier shown after the model name (`2x`). */
  multiplier?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Chip shown immediately after the option label (e.g. Native / ACP). */
  trailing?: ReactNode;
  disabled?: boolean;
  /** Hover reason when the row or tab cannot be selected. */
  disabledReason?: string;
  tone?: "warning";
  /** Host agent id when the same model id can appear under more than one agent. */
  agent?: string;
  favorited?: boolean;
  /** Override row selection when `value` is not unique across agents. */
  selected?: boolean;
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
  addFavorite?: string;
  removeFavorite?: string;
  noFavorites?: string;
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
  onModelChange?: (model: string, option?: PromptModel) => void;
  /** Favorites list shown when the host rail is on the Favorites tab. */
  favoriteModels?: PromptModel[];
  favoritesOpen?: boolean;
  onToggleFavorite?: (model: string, option: PromptModel) => void;
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
  /** Render only the agent/model config chrome, without the prompt shell. */
  configOnly?: boolean;
  /** Which side the agent/model popover opens toward. Default `top`. */
  menuSide?: "top" | "bottom";
  /** Embed the agent/model panel in-place instead of a trigger popover. */
  menuInline?: boolean;
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
  addFavorite: "Add favorite",
  removeFavorite: "Remove favorite",
  noFavorites: "No favorites yet",
};

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  favoriteModels = [],
  favoritesOpen = false,
  onToggleFavorite,
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
  configOnly = false,
  menuSide = "top",
  menuInline = false,
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
  const [internalModel, setInternalModel] = useState(defaultModel ?? models[0]?.value);
  const [actionsOpen, setActionsOpen] = useState(false);
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find((option) => option.value === currentModelValue);
  const currentAgent = agents.find((option) => option.value === agent);
  const canSubmit = canSubmitProp ?? (Boolean(currentValue.trim()) && !disabled && !loading);
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

  const setModel = (next: string, option?: PromptModel) => {
    if (model === undefined) setInternalModel(next);
    onModelChange?.(next, option);
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

  const agentConfigMenu =
    agents.length ||
    models.length ||
    thinkingLevels.length > 0 ||
    fastAvailable ||
    contextLevels.length > 1 ||
    modelsLoading ? (
      <PromptAgentConfigMenu
        agents={agents}
        agent={agent}
        agentLocked={agentLocked}
        onAgentChange={onAgentChange}
        models={models}
        model={currentModelValue}
        onModelChange={setModel}
        favoriteModels={favoriteModels}
        favoritesOpen={favoritesOpen}
        onToggleFavorite={onToggleFavorite}
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
        menuSide={menuSide}
        menuInline={menuInline}
      />
    ) : null;

  if (configOnly) {
    return (
      <div
        className={cn(
          menuInline ? "w-full min-w-0" : "flex min-h-8 min-w-0 flex-wrap items-center gap-1",
          className,
        )}
      >
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
        {agentConfigMenu}
      </div>
    );
  }

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
            className="pointer-events-none invisible absolute inset-x-2 top-0 px-2 text-sm leading-6 [overflow-wrap:break-word] whitespace-pre-wrap"
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
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {action.icon ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                      {action.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{action.label}</span>
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
          {agentConfigMenu}
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
  const current = options.find((option) => option.value === value) ?? options[0];
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
