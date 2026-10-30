"use client";

import { Check, ChevronRight, LoaderCircle, RefreshCw, Search, Star, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "../motion/popover-morph";
import {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
} from "../motion/tabs";
import { RangeSlider } from "../motion/range-slider";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
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
import type { PromptInputLabels, PromptModel } from "./prompt-input";

/** Model row action. Reports the model and leaves the surrounding picker open. */
export function selectPromptModel(
  model: string,
  option: PromptModel | undefined,
  onModelChange: (model: string, option?: PromptModel) => void,
): { model: string; dismissPicker: false } {
  onModelChange(model, option);
  return { model, dismissPicker: false };
}

export function PromptAgentConfigMenu({
  agents,
  agent,
  agentLocked,
  onAgentChange,
  models,
  model,
  onModelChange,
  favoriteModels = [],
  favoritesOpen = false,
  onToggleFavorite,
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
  extraArgsText,
  onExtraArgsChange,
  extraArgsLabel,
  extraArgsPlaceholder,
  extraArgsError,
  disabled,
  labels,
  className,
  controlRadius,
  agentTablist,
  menuSide = "top",
  menuInline = false,
  compact = false,
}: {
  agents: PromptModel[];
  agent?: string;
  agentLocked?: boolean;
  onAgentChange?: (agent: string) => void;
  models: PromptModel[];
  model?: string;
  onModelChange: (model: string, option?: PromptModel) => void;
  favoriteModels?: PromptModel[];
  favoritesOpen?: boolean;
  onToggleFavorite?: (model: string, option: PromptModel) => void;
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
  /** Current extra-args text. Rendered only when `onExtraArgsChange` is set. */
  extraArgsText?: string;
  onExtraArgsChange?: (value: string) => void;
  extraArgsLabel?: string;
  extraArgsPlaceholder?: string;
  extraArgsError?: string;
  disabled?: boolean;
  labels: Required<PromptInputLabels>;
  className?: string;
  controlRadius: string;
  agentTablist?: ReactNode;
  menuSide?: "top" | "bottom";
  menuInline?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const skipAgentList = agents.length === 0;
  const [search, setSearch] = useState("");
  const [effortOpen, setEffortOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const showThinking = thinkingLevels.length > 1;
  const showContext = contextLevels.length > 1;
  const currentThinking = thinkingLevels.find((level) => level.value === thinking);
  const currentContext =
    contextLevels.find((level) => level.value === context) ??
    contextLevels.find((level) => level.value === contextLevels[0]?.value) ??
    contextLevels[0];
  const thinkingLabel = showThinking
    ? titleCaseLabel(optionLabelText(currentThinking ?? thinkingLevels[0]))
    : "";
  const contextLabel = showContext ? optionLabelText(currentContext) : "";
  const contextSuffix = showContext ? contextModelSuffix(contextLabel, context) : "";
  const showEffortControls = showThinking || fastAvailable || showContext;
  const showExtraArgs = Boolean(onExtraArgsChange);
  const showEffortChip = showEffortControls || showExtraArgs;
  const effortLabel =
    modelEffortTriggerLabel({
      thinkingLabel,
      fastAvailable,
      fastEnabled,
      fastLabel: labels.fastChip,
    }) || contextLabel;
  const effortChipLabel =
    effortLabel || (showExtraArgs ? extraArgsLabel : "") || labels.thinkingEffort;
  const triggerText = agentConfigTriggerText({
    modelLabel: optionName(currentModel),
    contextLabel: contextSuffix,
    thinkingLabel,
    agentLabel: optionName(currentAgent) || labels.chooseAgent,
    fastLabel: fastAvailable && fastEnabled ? labels.fastChip : "",
  });
  const listedModels = favoritesOpen ? favoriteModels : models;
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listedModels;
    return listedModels.filter((option) => optionSearchText(option).toLowerCase().includes(q));
  }, [listedModels, search]);
  const groupedModels = useMemo(() => groupedPromptModelRows(filteredModels), [filteredModels]);
  const selectedAgent = agent || agents[0]?.value || "";

  useEffect(() => {
    setSearch("");
  }, [agent, favoritesOpen]);
  useEffect(() => {
    setEffortOpen(false);
    setContextOpen(false);
  }, [agent, model]);

  const renderEffortPopover = () =>
    showEffortChip ? (
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
            aria-label={effortChipLabel}
            className="inline-flex h-6 max-w-[10rem] shrink-0 items-center gap-0.5 rounded-full bg-foreground/10 px-2 text-[11px] text-muted-foreground outline-none hover:bg-foreground/15 hover:text-foreground focus-visible:ring-2"
          >
            <span className="min-w-0 truncate">{effortChipLabel}</span>
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
          <PromptEffortPopoverBody
            showContext={showContext}
            showThinking={showThinking}
            fastAvailable={fastAvailable}
            contextLevels={contextLevels}
            context={context}
            currentContextValue={currentContext?.value}
            contextLabel={contextLabel}
            onContextChange={onContextChange}
            contextOpen={contextOpen}
            onContextOpenChange={setContextOpen}
            thinkingLevels={thinkingLevels}
            thinking={thinking}
            onThinkingChange={onThinkingChange}
            fastEnabled={fastEnabled}
            onFastChange={onFastChange}
            disabled={disabled}
            labels={labels}
            extraArgsText={extraArgsText}
            onExtraArgsChange={onExtraArgsChange}
            extraArgsLabel={extraArgsLabel}
            extraArgsPlaceholder={extraArgsPlaceholder}
            extraArgsError={extraArgsError}
          />
        </MorphPopoverContent>
      </MorphPopover>
    ) : null;

  const panel = (
    <div
      className={cn(
        "flex max-h-[min(24rem,calc(100dvh-1rem))] overflow-hidden",
        menuInline
          ? "w-full rounded-lg border border-border bg-muted/30"
          : "rounded-2xl border border-border bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]",
        menuInline && className,
      )}
    >
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
            variant="pill"
            orientation="vertical"
            className="flex h-full min-h-0 min-w-0 flex-col items-stretch"
            onValueChange={
              agentLocked
                ? undefined
                : (value) => {
                    const next = agents.find((option) => option.value === value);
                    if (next?.disabled) return;
                    onAgentChange?.(value);
                    setSearch("");
                    setEffortOpen(false);
                  }
            }
          >
            <MotionTabsList
              className="flex h-full max-h-full min-h-0 w-11 flex-col items-center justify-start overflow-y-auto bg-[color-mix(in_oklab,var(--popover),black_10%)] p-1"
              indicatorClassName="bg-active"
            >
              {agents.map((option) => {
                const label = optionLabelText(option);
                const reason = option.disabledReason?.trim() || "";
                const hint = reason || (agentLocked ? labels.agentLocked : "");
                return (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <MotionTabsTrigger
                          value={option.value}
                          disabled={option.disabled || agentLocked}
                          aria-label={label}
                          title={hint || label}
                          className="group pointer-events-auto size-9 shrink-0 px-0 text-xs aria-selected:!text-foreground"
                        >
                          {option.icon ?? (
                            <span className="text-[10px] font-medium">{label.slice(0, 1)}</span>
                          )}
                        </MotionTabsTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="z-[10000]">
                      {hint ? (
                        hint
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
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          menuInline ? "w-auto" : "w-[16.5rem]",
        )}
      >
        {listedModels.length > 0 ? (
          <div className="flex min-w-0 items-center gap-1 px-2 pt-1.5 pb-1">
            <div className="min-w-0 flex-1">
              <SelectSearch
                value={search}
                onChange={setSearch}
                placeholder={labels.searchModels}
                padded={false}
              />
            </div>
            {onLoadModels && !favoritesOpen ? (
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
          className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", listedModels.length > 0 && "pt-0")}
        >
          {Boolean(modelsLoading) && listedModels.length === 0 && !favoritesOpen ? (
            <div
              className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground"
              aria-busy="true"
              aria-live="polite"
            >
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              <span>{labels.loadingModels}</span>
            </div>
          ) : listedModels.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2.5 py-3">
              <div className="text-center text-xs text-muted-foreground">
                {favoritesOpen ? labels.noFavorites : labels.noResults}
              </div>
              {onLoadModels && !favoritesOpen ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadModels()}
                  className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {labels.loadModels}
                </button>
              ) : null}
              {showExtraArgs && !showThinking ? renderEffortPopover() : null}
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              {labels.noResults}
            </div>
          ) : (
            groupedModels.map((row, index) => {
              if (row.type === "header") {
                const following = groupedModels[index + 1];
                const groupIcon =
                  following?.type === "option" ? following.option.groupIcon : undefined;
                return (
                  <div
                    key={`group:${index}:${row.label}`}
                    className="flex items-center gap-1.5 px-2.5 pt-2 pb-0.5 text-xs text-muted-foreground"
                  >
                    {groupIcon ? (
                      <span className="inline-flex size-3.5 shrink-0 items-center justify-center [&_img]:size-3.5 [&_svg]:size-3.5">
                        {groupIcon}
                      </span>
                    ) : null}
                    {row.label}
                  </div>
                );
              }
              const option = row.option;
              const isSelected = option.selected ?? option.value === model;
              const warning = isSelected && option.tone === "warning";
              const fullLabel = modelLabelWithContext(
                optionName(option),
                isSelected ? contextSuffix : "",
              );
              const rowDisabled = Boolean(option.disabled || modelsLocked);
              const rowHint = modelsLocked
                ? labels.modelLocked
                : option.disabledReason?.trim() || fullLabel;
              const modelButton = (
                <button
                  type="button"
                  disabled={rowDisabled}
                  title={option.disabledReason?.trim() || undefined}
                  onClick={() => {
                    if (rowDisabled) return;
                    selectPromptModel(option.value, option, onModelChange);
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 gap-2 py-2 text-left text-sm outline-none",
                    (option.group ?? "").trim() ? "pr-2.5 pl-4" : "px-2.5",
                    option.description ? "items-start" : "items-center",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <OptionRow
                      option={
                        isSelected && contextSuffix
                          ? {
                              ...option,
                              label: modelLabelWithContext(optionName(option), contextSuffix),
                            }
                          : option
                      }
                    />
                  </span>
                </button>
              );
              return (
                <div
                  key={promptModelRowKey(option)}
                  className={cn(
                    "group/model flex w-full items-center gap-1 rounded-lg",
                    warning
                      ? "bg-muted text-warning"
                      : isSelected
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/70",
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {rowDisabled ? (
                        <span className="inline-flex min-w-0 flex-1">{modelButton}</span>
                      ) : (
                        modelButton
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top" className="z-[10000] max-w-xs">
                      {rowHint}
                    </TooltipContent>
                  </Tooltip>
                  {isSelected && showEffortChip ? renderEffortPopover() : null}
                  <ModelFavoriteMark
                    option={option}
                    selected={isSelected}
                    addLabel={labels.addFavorite}
                    removeLabel={labels.removeFavorite}
                    onToggle={onToggleFavorite}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  if (menuInline) {
    return panel;
  }

  return (
    <MorphPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
        setEffortOpen(false);
        setContextOpen(false);
        if (next && models.length === 0 && !favoritesOpen) {
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
            "inline-flex h-8 items-center gap-1.5 border-0 bg-transparent py-0 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2",
            compact ? "max-w-[9rem] shrink-0 px-1.5" : "max-w-[22rem] px-2",
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
        side={menuSide}
        align="end"
        sideOffset={8}
        radius={16}
        clip={false}
        className="overflow-visible border-0 bg-transparent p-0"
      >
        {panel}
      </MorphPopoverContent>
    </MorphPopover>
  );
}

export function PromptEffortPopoverBody({
  showContext,
  showThinking,
  fastAvailable,
  contextLevels,
  context,
  currentContextValue,
  contextLabel,
  onContextChange,
  contextOpen,
  onContextOpenChange,
  thinkingLevels,
  thinking,
  onThinkingChange,
  fastEnabled,
  onFastChange,
  disabled,
  labels,
  extraArgsText,
  onExtraArgsChange,
  extraArgsLabel,
  extraArgsPlaceholder,
  extraArgsError,
}: {
  showContext: boolean;
  showThinking: boolean;
  fastAvailable?: boolean;
  contextLevels: PromptModel[];
  context?: string;
  currentContextValue?: string;
  contextLabel: string;
  onContextChange?: (context: string) => void;
  contextOpen: boolean;
  onContextOpenChange: (open: boolean) => void;
  thinkingLevels: PromptModel[];
  thinking?: string;
  onThinkingChange?: (thinking: string) => void;
  fastEnabled?: boolean;
  onFastChange?: (enabled: boolean) => void;
  disabled?: boolean;
  labels: Required<PromptInputLabels>;
  extraArgsText?: string;
  onExtraArgsChange?: (value: string) => void;
  extraArgsLabel?: string;
  extraArgsPlaceholder?: string;
  extraArgsError?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-popover py-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.14)]",
        onExtraArgsChange ? "w-[18rem]" : "w-[13.75rem]",
      )}
    >
      {showContext ? (
        <div className="px-1">
          <MorphPopover
            open={contextOpen}
            onOpenChange={onContextOpenChange}
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
                  const selected = level.value === (context || currentContextValue);
                  return (
                    <button
                      key={level.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onContextChange?.(level.value);
                        onContextOpenChange(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm outline-none",
                        selected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/70",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{optionLabelText(level)}</span>
                      {selected ? (
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
            <span className="shrink-0 text-sm font-medium text-foreground">{labels.fastMode}</span>
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
      {onExtraArgsChange ? (
        <div className="px-3.5 pt-1 pb-1.5">
          <label className="mb-1 block text-xs font-medium text-foreground">{extraArgsLabel}</label>
          <input
            value={extraArgsText ?? ""}
            placeholder={extraArgsPlaceholder}
            aria-label={extraArgsLabel}
            onChange={(event) => onExtraArgsChange(event.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2"
          />
          {extraArgsError ? (
            <p className="mt-1 text-xs text-destructive">{extraArgsError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ConfigFlyoutList({
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
        <div className="px-3.5 pt-2.5 pb-0.5 text-[11px] text-muted-foreground">{heading}</div>
      ) : null}
      {showSearch ? (
        <SelectSearch
          value={search}
          onChange={onSearch ?? (() => {})}
          placeholder={searchPlaceholder}
        />
      ) : null}
      <div
        className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", (showSearch || heading) && "pt-0")}
      >
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
          <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</div>
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
                  "flex w-full gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none",
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
                  <Check
                    className={cn("size-3.5 shrink-0 text-current", option.description && "mt-0.5")}
                  />
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
          <span className="min-w-0 truncate text-sm">{option.label}</span>
          {multiplier ? (
            <span className="shrink-0 text-sm text-muted-foreground">{multiplier}</span>
          ) : null}
          {option.trailing ? <span className="shrink-0">{option.trailing}</span> : null}
        </span>
        {option.description ? (
          <span className="mt-0.5 block text-xs leading-4 opacity-70">{option.description}</span>
        ) : null}
      </span>
    </span>
  );
}

function promptModelRowKey(option: PromptModel): string {
  return option.agent ? `${option.agent}\u001f${option.value}` : option.value;
}

function ModelFavoriteMark({
  option,
  selected,
  addLabel,
  removeLabel,
  onToggle,
}: {
  option: PromptModel;
  selected: boolean;
  addLabel: string;
  removeLabel: string;
  onToggle?: (model: string, option: PromptModel) => void;
}) {
  if (!onToggle) {
    return (
      <span
        aria-hidden
        className={cn(
          "mr-2 size-3.5 shrink-0 rounded-full border",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground/35",
        )}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={option.favorited ? removeLabel : addLabel}
      aria-pressed={Boolean(option.favorited)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(option.value, option);
      }}
      className="relative mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:text-favorite focus-visible:ring-2"
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none size-3.5 rounded-full border transition-opacity",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground/35",
          option.favorited || "group-focus-within/model:opacity-0 group-hover/model:opacity-0",
          option.favorited && "opacity-0",
        )}
      />
      <Star
        aria-hidden
        className={cn(
          "pointer-events-none absolute size-3.5 transition-opacity",
          option.favorited
            ? "fill-favorite text-favorite opacity-100"
            : "opacity-0 group-focus-within/model:opacity-100 group-hover/model:opacity-100",
        )}
      />
    </button>
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

export function optionLabelText(option?: PromptModel): string {
  if (!option) return "";
  return formatModelProviderLabel(optionName(option), option.group);
}
