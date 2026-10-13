"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  PromptAgentConfigMenu,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type PromptInputLabels,
  type PromptModel,
} from "@workspace/ui";
import type { TerminalAgentPrefs } from "@atmos/api-types/ws/dto/settings";
import { Settings2, Star } from "lucide-react";

import { wsRequest } from "@/api/ws/request";
import {
  CenterStageScrollableTabs,
  CenterStageTab,
  CenterStageTabList,
} from "@/app-shell/center-stage-shared-tabs";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { TerminalAgentSelectorOption } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import { useTerminalAgentOptions } from "@/features/agent/hooks/use-terminal-agent-options";
import { thinkingLevelMessageKey } from "@/features/agent/lib/agent-chat-thread";
import {
  joinExtraArgsText,
  parseExtraArgsText,
  reasoningSupportForAgent,
  sanitizeRunConfig,
  terminalFastVisible,
  terminalModelCatalogEnabled,
  effortLevelsForTerminalRow,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";

const FAVORITES_TAB = "__terminal_favorites__";

function effortLabel(value: string, translate: (key: string) => string): string {
  const key = thinkingLevelMessageKey(value);
  return key ? translate(`chatPanel.pickers.thinkingLevels.${key}`) : value;
}

function reasoningMode(agentId: string): "enum" | "encoded_in_model" | null {
  // OpenCode's CLI effort is `--variant`. The manifest has no closed enum, so
  // levels come only from a native per-model probe.
  if (agentId === "opencode") return "enum";
  const mode = reasoningSupportForAgent(agentId).mode;
  return mode === "enum" || mode === "encoded_in_model" ? mode : null;
}

export function TerminalAgentModelPopover({
  options,
  agentId,
  runConfig,
  runConfigFor,
  onRunConfigChange,
  onSelectAgent,
  onModelChosen,
  agentLocked = false,
  menuInline = false,
  hydrateLastPick = true,
  onOpenAgentList,
  className,
}: {
  options: readonly TerminalAgentSelectorOption[];
  agentId: string;
  runConfig?: TerminalAgentRunConfigInput | null;
  runConfigFor?: (agentId: string) => TerminalAgentRunConfigInput | null;
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
  onSelectAgent?: (agentId: string) => void;
  onModelChosen?: (agentId: string) => void;
  agentLocked?: boolean;
  menuInline?: boolean;
  onOpenAgentList?: () => void;
  /** When false, an empty controlled config stays empty. Attention summary uses this. */
  hydrateLastPick?: boolean;
  className?: string;
}) {
  const t = useTranslations("Agent.components");
  const [prefs, setPrefs] = React.useState<TerminalAgentPrefs | null>(null);
  const [favoritesOpen, setFavoritesOpen] = React.useState(false);
  const [extraDraft, setExtraDraft] = React.useState("");
  const [extraError, setExtraError] = React.useState<string | null>(null);
  const extraInvalid = React.useRef(false);
  const catalogEnabled = terminalModelCatalogEnabled(agentId);
  const { catalog, loading, reload } = useTerminalAgentOptions(agentId, catalogEnabled);
  const prefsEpoch = React.useRef(0);

  const configFor = React.useCallback(
    (id: string) => {
      if (runConfigFor) return sanitizeRunConfig(runConfigFor(id));
      return id === agentId ? sanitizeRunConfig(runConfig) : null;
    },
    [agentId, runConfig, runConfigFor],
  );

  const activeConfig = configFor(agentId);
  const storedExtra = joinExtraArgsText(activeConfig?.extra_args);

  React.useEffect(() => {
    const epoch = prefsEpoch.current;
    let cancelled = false;
    void wsRequest("terminal_agent_prefs_get", {})
      .then((next) => {
        if (cancelled || epoch !== prefsEpoch.current) return;
        setPrefs(next);
      })
      .catch(() => {
        if (cancelled || epoch !== prefsEpoch.current) return;
        setPrefs({ favorite_models: [], agents: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    extraInvalid.current = false;
    setExtraError(null);
    setExtraDraft(storedExtra);
  }, [agentId, storedExtra]);

  const disabledReasonFor = React.useCallback(
    (id: string) => options.find((option) => option.id === id)?.disabledReason?.trim() || "",
    [options],
  );

  const persistLastPick = React.useCallback((id: string, model: string | null, effort: string | null) => {
    const epoch = ++prefsEpoch.current;
    void wsRequest("terminal_agent_prefs_set", {
      agents: { [id]: { model, effort } },
    })
      .then((next) => {
        if (epoch !== prefsEpoch.current) return;
        setPrefs(next);
      })
      .catch(() => undefined);
  }, []);

  const commitConfig = React.useCallback(
    (id: string, next: TerminalAgentRunConfigInput | null, remember: boolean) => {
      const saved = sanitizeRunConfig(next);
      onRunConfigChange(id, saved);
      if (!remember) return;
      persistLastPick(id, saved?.model ?? null, saved?.reasoning?.value ?? null);
    },
    [onRunConfigChange, persistLastPick],
  );

  const hydratedAgents = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!hydrateLastPick) return;
    if (!prefs) return;
    if (hydratedAgents.current.has(agentId)) return;
    const pick = prefs.agents?.[agentId];
    const current = configFor(agentId);
    if (
      current?.model?.trim()
      || current?.reasoning?.value?.trim()
      || (current?.extra_args?.length ?? 0) > 0
      || current?.fast === true
    ) {
      hydratedAgents.current.add(agentId);
      return;
    }
    const model = pick?.model?.trim() || null;
    const effort = pick?.effort?.trim() || null;
    hydratedAgents.current.add(agentId);
    if (!model && !effort) return;
    const mode = reasoningMode(agentId);
    commitConfig(agentId, {
      model,
      reasoning: effort && mode ? { mode, value: effort } : null,
      extra_args: current?.extra_args,
    }, false);
  }, [agentId, commitConfig, configFor, hydrateLastPick, prefs]);

  const levelsFor = React.useCallback(
    (id: string, model: string | null | undefined) =>
      effortLevelsForTerminalRow(
        id,
        model,
        model ? catalog?.models?.find((item) => item.id === model) : undefined,
      ),
    [catalog?.models],
  );

  const activeModel = activeConfig?.model?.trim() || "";
  const activeEffort = activeConfig?.reasoning?.value?.trim() || "";
  React.useEffect(() => {
    if (!activeModel || !activeEffort) return;
    const row = catalog?.models?.find((item) => item.id === activeModel);
    if (!row) return;
    const levels = effortLevelsForTerminalRow(agentId, activeModel, row);
    if (levels.includes(activeEffort)) return;
    commitConfig(agentId, {
      model: activeModel,
      reasoning: null,
      extra_args: activeConfig?.extra_args,
      fast: activeConfig?.fast === true ? true : undefined,
    }, true);
  }, [
    activeConfig?.extra_args,
    activeConfig?.fast,
    activeEffort,
    activeModel,
    agentId,
    catalog?.models,
    commitConfig,
  ]);

  const effortLevels = levelsFor(agentId, activeConfig?.model);
  const selectedOption = options.find((option) => option.id === agentId) ?? null;

  const catalogModels = React.useMemo(() => {
    const rows = catalog?.models ?? [];
    const favorites = prefs?.favorite_models ?? [];
    const mapped = rows.map((item) => ({
      value: item.id,
      label: item.label || item.id,
      group: item.group?.trim() || undefined,
      agent: agentId,
      favorited: favorites.some((favorite) => favorite.agent_id === agentId && favorite.model === item.id),
    }));
    const stored = activeConfig?.model?.trim();
    if (stored && !mapped.some((item) => item.value === stored)) {
      mapped.unshift({
        value: stored,
        label: stored,
        group: undefined,
        agent: agentId,
        favorited: favorites.some((favorite) => favorite.agent_id === agentId && favorite.model === stored),
      });
    }
    return mapped;
  }, [activeConfig?.model, agentId, catalog?.models, prefs?.favorite_models]);

  const favoriteModels = React.useMemo<PromptModel[]>(() => {
    return (prefs?.favorite_models ?? []).flatMap((favorite) => {
      const agent = options.find((option) => option.id === favorite.agent_id);
      if (!favorite.agent_id.trim() || !favorite.model.trim()) return [];
      const reason = agent?.disabledReason?.trim() || "";
      return [{
        value: favorite.model,
        label: favorite.label?.trim() || favorite.model,
        group: agent?.label || favorite.agent_id,
        agent: favorite.agent_id,
        disabled: Boolean(reason),
        disabledReason: reason || undefined,
        favorited: true,
        icon: (
          <AgentIcon
            registryId={favorite.agent_id}
            name={agent?.label || favorite.agent_id}
            size={16}
          />
        ),
      }];
    });
  }, [options, prefs?.favorite_models]);

  const labels: Required<PromptInputLabels> = {
    chooseModel: t("composer.chooseModel"),
    chooseAgent: t("composer.selectAgent"),
    chooseMode: t("composer.chooseMode"),
    choosePermission: t("composer.choosePermission"),
    model: t("composer.model"),
    modelLocked: t("composer.modelLocked"),
    agentLocked: t("composer.agentLocked"),
    modeLocked: t("composer.modeLocked"),
    permissionLocked: t("composer.permissionLocked"),
    search: t("configOptionDropdown.searchPlaceholder"),
    searchModels: t("composer.searchModels"),
    searchAgents: t("composer.searchAgents"),
    back: t("composer.backToAgents"),
    noResults: catalogEnabled ? t("configOptionDropdown.noResults") : t("runConfig.noModelCatalog"),
    loadingModels: t("composer.loadingModels"),
    loadModels: t("composer.loadModels"),
    reloadModels: t("composer.reloadModels"),
    thinkingFaster: t("composer.thinkingFaster"),
    thinkingSmarter: t("composer.thinkingSmarter"),
    thinkingEffort: t("composer.thinkingEffort"),
    fastMode: t("composer.fastMode"),
    fastChip: t("composer.fastChip"),
    context: t("composer.context"),
    addFavorite: t("composer.addFavorite"),
    removeFavorite: t("composer.removeFavorite"),
    noFavorites: t("composer.noFavorites"),
  };

  const applyModel = (model: string, option?: PromptModel) => {
    const target = option?.agent?.trim() || agentId;
    if (agentLocked && target !== agentId) return;
    if (disabledReasonFor(target)) return;
    if (option?.disabled) return;
    const current = configFor(target);
    const levels = levelsFor(target, model);
    const previous = current?.reasoning?.value?.trim() || "";
    const effort = previous && levels.includes(previous) ? previous : null;
    const mode = reasoningMode(target);
    const nextRow = catalog?.models?.find((item) => item.id === model);
    const fast = current?.fast === true && terminalFastVisible(target, nextRow) ? true : undefined;
    commitConfig(target, {
      model,
      reasoning: effort && mode ? { mode, value: effort } : null,
      extra_args: current?.extra_args,
      fast,
    }, true);
    if (!agentLocked) onModelChosen?.(target);
  };

  const applyEffort = (value: string) => {
    const mode = reasoningMode(agentId);
    if (!mode || disabledReasonFor(agentId)) return;
    const levels = levelsFor(agentId, activeConfig?.model);
    if (!levels.includes(value)) return;
    commitConfig(agentId, {
      model: activeConfig?.model ?? null,
      reasoning: { mode, value },
      extra_args: activeConfig?.extra_args,
      fast: activeConfig?.fast === true ? true : undefined,
    }, true);
  };

  const applyFast = (enabled: boolean) => {
    const row = catalog?.models?.find((item) => item.id === activeConfig?.model);
    if (!terminalFastVisible(agentId, row)) return;
    commitConfig(agentId, {
      model: activeConfig?.model ?? null,
      reasoning: activeConfig?.reasoning ?? null,
      extra_args: activeConfig?.extra_args,
      fast: enabled ? true : undefined,
    }, false);
  };

  const applyExtraArgs = (text: string) => {
    setExtraDraft(text);
    try {
      const parsed = parseExtraArgsText(text);
      extraInvalid.current = false;
      setExtraError(null);
      commitConfig(agentId, {
        model: activeConfig?.model ?? null,
        reasoning: activeConfig?.reasoning ?? null,
        extra_args: parsed,
        fast: activeConfig?.fast === true ? true : undefined,
      }, false);
    } catch {
      extraInvalid.current = true;
      setExtraError(t("runConfig.errors.invalidExtraArgs"));
    }
  };

  const toggleFavorite = (model: string, option: PromptModel) => {
    if (!prefs) return;
    const owner = option.agent?.trim() || agentId;
    if (!owner || !model.trim()) return;
    const current = prefs.favorite_models;
    const exists = current.some((favorite) => favorite.agent_id === owner && favorite.model === model);
    const label = typeof option.label === "string" && option.label.trim() ? option.label : model;
    const favoriteModels = exists
      ? current.filter((favorite) => !(favorite.agent_id === owner && favorite.model === model))
      : [...current, { agent_id: owner, model, label }];
    const epoch = ++prefsEpoch.current;
    void wsRequest("terminal_agent_prefs_set", { favorite_models: favoriteModels })
      .then((next) => {
        if (epoch !== prefsEpoch.current) return;
        setPrefs(next);
      })
      .catch(() => undefined);
  };

  return (
    <PromptAgentConfigMenu
      menuInline={menuInline}
      className={className}
      controlRadius="rounded-lg"
      agents={options.map((option) => ({
        value: option.id,
        label: option.label,
        disabled: Boolean(option.disabledReason?.trim()) || (agentLocked && option.id !== agentId),
        disabledReason: option.disabledReason?.trim() || undefined,
        icon: <AgentIcon registryId={option.id} name={option.label} size={16} />,
      }))}
      agent={agentId}
      agentLocked={agentLocked}
      onAgentChange={(next) => {
        if (agentLocked || disabledReasonFor(next)) return;
        setFavoritesOpen(false);
        onSelectAgent?.(next);
      }}
      agentTablist={
        options.length === 0 ? null : (
          <div className="flex h-full min-h-0 flex-col items-center">
          <CenterStageTabList
            orientation="vertical"
            className="h-full min-h-0 px-0 py-0"
            value={favoritesOpen ? FAVORITES_TAB : agentId || options[0]?.id || FAVORITES_TAB}
            onValueChange={(value) => {
              if (value === FAVORITES_TAB) {
                setFavoritesOpen(true);
                return;
              }
              const reason = disabledReasonFor(value);
              if (reason) return;
              if (agentLocked && value !== agentId) return;
              setFavoritesOpen(false);
              if (agentLocked) return;
              onSelectAgent?.(value);
            }}
          >
            <CenterStageScrollableTabs
              orientation="vertical"
              className="max-h-[min(22rem,calc(100dvh-8rem))]"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <CenterStageTab
                      value={FAVORITES_TAB}
                      aria-label={t("composer.favorites")}
                      title={t("composer.favorites")}
                      className="size-9 px-0"
                    >
                      <Star className={favoritesOpen ? "size-4 fill-current" : "size-4"} />
                    </CenterStageTab>
                  </span>
                </TooltipTrigger>
                <TooltipContent side={menuInline ? "right" : "left"} className="z-[10000]">
                  {t("composer.favorites")}
                </TooltipContent>
              </Tooltip>
              <div aria-hidden className="mx-auto my-1 h-px w-5 bg-border/80" />
              <div className="flex flex-col items-center">
                {options.map((option) => {
                  const reason = option.disabledReason?.trim() || "";
                  const lockedOut = agentLocked && option.id !== agentId;
                  const tabDisabled = Boolean(reason) || lockedOut;
                  const hint = reason || (lockedOut ? t("composer.agentLocked") : option.label);
                  return (
                    <Tooltip key={option.id}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <CenterStageTab
                            value={option.id}
                            disabled={tabDisabled}
                            aria-label={option.label}
                            title={hint}
                            className={tabDisabled ? "size-9 px-0 opacity-40" : "size-9 px-0"}
                          >
                            <AgentIcon registryId={option.id} name={option.label} size={16} />
                          </CenterStageTab>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side={menuInline ? "right" : "left"} className="z-[10000]">
                        {hint}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </CenterStageScrollableTabs>
          </CenterStageTabList>
          {onOpenAgentList ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("selector.selectAgent")}
                  onClick={onOpenAgentList}
                  className="mb-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2"
                >
                  <Settings2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={menuInline ? "right" : "left"} className="z-[10000]">
                {t("selector.selectAgent")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          </div>
        )
      }
      models={catalogModels}
      model={activeConfig?.model ?? ""}
      onModelChange={applyModel}
      favoriteModels={favoriteModels}
      favoritesOpen={favoritesOpen}
      onToggleFavorite={toggleFavorite}
      modelsLoading={catalogEnabled && loading && catalogModels.length === 0}
      modelsReloading={catalogEnabled && loading && catalogModels.length > 0}
      onEmptyModelsOpen={catalogEnabled ? () => void reload() : undefined}
      onLoadModels={catalogEnabled ? () => void reload() : undefined}
      currentAgent={selectedOption ? {
        value: selectedOption.id,
        label: selectedOption.label,
        icon: <AgentIcon registryId={selectedOption.id} name={selectedOption.label} size={16} />,
      } : undefined}
      currentModel={catalogModels.find((item) => item.value === activeConfig?.model)}
      thinkingLevels={effortLevels.map((value) => ({
        value,
        label: effortLabel(value, t),
      }))}
      thinking={activeConfig?.reasoning?.value ?? ""}
      onThinkingChange={applyEffort}
      fastAvailable={terminalFastVisible(
        agentId,
        catalog?.models?.find((item) => item.id === activeConfig?.model),
      )}
      fastEnabled={activeConfig?.fast === true}
      onFastChange={applyFast}
      contextLevels={[]}
      disabled={false}
      labels={labels}
      extraArgsText={extraDraft}
      onExtraArgsChange={
        catalogEnabled && catalogModels.length === 0 ? undefined : applyExtraArgs
      }
      extraArgsLabel={t("runConfig.extraArgs.title")}
      extraArgsPlaceholder={t("runConfig.extraArgs.placeholder")}
      extraArgsError={extraError ?? undefined}
    />
  );
}
