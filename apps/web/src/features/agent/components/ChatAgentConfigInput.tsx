"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AgentsPromptInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  type AgentsPromptInputProps,
  type PromptModel,
} from "@workspace/ui";
import {
  Astroid,
  BotMessageSquare,
  Code2,
  Hammer,
  Hand,
  Layers,
  ListTodo,
  MessageCircleQuestionMark,
  MessageSquare,
  NotebookPen,
  PencilSparkles,
  Shield,
  ShieldAlert,
  Star,
} from "lucide-react";
import {
  CenterStageScrollableTabs,
  CenterStageTab,
  CenterStageTabList,
} from "@/app-shell/center-stage-shared-tabs";
import type { RegistryAgent } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useAgentChatFavorites } from "@/features/agent/hooks/use-agent-chat-favorites";
import {
  AGENT_CHAT_FAVORITES_TAB,
  isFavoriteModel,
  orderFavoriteModels,
  resolveFavoriteModelLabel,
} from "@/features/agent/lib/agent-chat-favorites";
import {
  displayedComposerConfigValue,
  permissionModeMessageKey,
  thinkingLevelMessageKey,
} from "@/features/agent/lib/agent-chat-thread";
import type { AgentConfigOption } from "@/features/agent/lib/agent-chat-types";
import {
  chatAgentFamily,
  chatAgentKind,
  contestedChatAgentFamilies,
} from "@/features/agent/lib/custom-agent-registry";
import { readComposerLocalCache } from "@/features/agent/store/agent-composer-local-cache";

export type ChatAgentConfigKind =
  | "model"
  | "thinking"
  | "mode"
  | "permission_mode"
  | "fast"
  | "context";

type OwnedPromptKeys =
  | "agents"
  | "agent"
  | "agentLocked"
  | "onAgentChange"
  | "agentTablist"
  | "models"
  | "model"
  | "favoriteModels"
  | "favoritesOpen"
  | "onToggleFavorite"
  | "onModelChange"
  | "modelsLocked"
  | "modelsLoading"
  | "modelsReloading"
  | "onEmptyModelsOpen"
  | "onLoadModels"
  | "modes"
  | "mode"
  | "onModeChange"
  | "modesLocked"
  | "permissionModes"
  | "permissionMode"
  | "onPermissionModeChange"
  | "thinkingLevels"
  | "thinking"
  | "onThinkingChange"
  | "fastAvailable"
  | "fastEnabled"
  | "onFastChange"
  | "contextLevels"
  | "context"
  | "onContextChange"
  | "labels"
  | "configOnly"
  | "menuSide"
  | "menuInline";

export type ChatAgentConfigInputProps = {
  installedAgents: readonly RegistryAgent[];
  registryId: string | null;
  modelOption: AgentConfigOption | null;
  thinkingOption: AgentConfigOption | null;
  modeOption: AgentConfigOption | null;
  permissionOption: AgentConfigOption | null;
  fastOption: AgentConfigOption | null;
  contextOption: AgentConfigOption | null;
  onProviderChange?: (providerId: string, opts?: { model?: string }) => void;
  onConfigChange: (kind: ChatAgentConfigKind, value: string) => void;
  agentLocked?: boolean;
  modelsLocked?: boolean;
  modesLocked?: boolean;
  modelsLoading?: boolean;
  modelsReloading?: boolean;
  onEmptyModelsOpen?: () => void;
  onLoadModels?: () => void;
  configOnly?: boolean;
  menuSide?: "top" | "bottom";
  menuInline?: boolean;
} & Omit<AgentsPromptInputProps, OwnedPromptKeys>;

function toPromptModels(
  option: AgentConfigOption | null,
  localize?: (value: string, name?: string) => string,
  extras?: { fastEnabled?: boolean },
): PromptModel[] {
  if (!option) return [];
  return option.options.map((entry) => ({
    value: entry.value,
    label: localize ? localize(entry.value, entry.name) : (entry.name || entry.value),
    group: entry.group,
    multiplier: extras?.fastEnabled && entry.fastMultiplier
      ? entry.fastMultiplier
      : entry.multiplier,
  }));
}

function compactModeId(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, "");
}

function isFastOnValue(value: string): boolean {
  const token = value.trim().toLowerCase();
  return token === "true" || token === "on" || token === "1" || token === "yes";
}

function resolveFastToggleValue(
  option: AgentConfigOption | null,
  enabled: boolean,
): string | null {
  if (!option || option.options.length === 0) return null;
  const on = option.options.find((item) => isFastOnValue(item.value));
  const off = option.options.find((item) => !isFastOnValue(item.value));
  if (enabled) return on?.value ?? option.options[1]?.value ?? option.options[0]?.value ?? null;
  return off?.value ?? option.options[0]?.value ?? null;
}

function modeIcon(value: string) {
  switch (compactModeId(value)) {
    case "plan":
      return <ListTodo className="size-3.5 shrink-0" />;
    case "spec":
      return <NotebookPen className="size-3.5 shrink-0" />;
    case "auto":
    case "default":
    case "normal":
      return <MessageSquare className="size-3.5 shrink-0" />;
    case "build":
      return <Hammer className="size-3.5 shrink-0" />;
    case "code":
      return <Code2 className="size-3.5 shrink-0" />;
    case "ask":
      return <MessageCircleQuestionMark className="size-3.5 shrink-0" />;
    case "agent":
      return <BotMessageSquare className="size-3.5 shrink-0" />;
    default:
      return <Layers className="size-3.5 shrink-0" />;
  }
}

function toModePromptModels(option: AgentConfigOption | null): PromptModel[] {
  return toPromptModels(option).map((entry) => ({
    ...entry,
    icon: modeIcon(entry.value),
  }));
}

function resolvedConfigOptionValue(
  option: AgentConfigOption | null,
  kind: "mode" | "permission_mode" | "thinking" | "fast" | "context",
): string {
  if (!option) return "";
  return displayedComposerConfigValue([option], kind, option.currentValue || "");
}

function permissionModeIcon(key: string | null) {
  switch (key) {
    case "yolo":
      return <ShieldAlert className="size-3.5 shrink-0" />;
    case "acceptEdits":
      return <PencilSparkles className="size-3.5 shrink-0" />;
    case "auto":
      return <Astroid className="size-3.5 shrink-0" />;
    case "askAlways":
      return <Hand className="size-3.5 shrink-0" />;
    default:
      return <Shield className="size-3.5 shrink-0" />;
  }
}

function toPermissionPromptModels(
  option: AgentConfigOption | null,
  localize: (kind: "permissionModes" | "permissionModeDescriptions", key: string) => string,
): PromptModel[] {
  if (!option) return [];
  return option.options.map((entry) => {
    const key = permissionModeMessageKey(entry.value);
    return {
      value: entry.value,
      label: key ? localize("permissionModes", key) : (entry.name || entry.value),
      description: key ? localize("permissionModeDescriptions", key) : undefined,
      icon: permissionModeIcon(key),
      tone: key === "yolo" ? "warning" : undefined,
    };
  });
}

export function ChatAgentConfigInput({
  installedAgents,
  registryId,
  modelOption,
  thinkingOption,
  modeOption,
  permissionOption,
  fastOption,
  contextOption,
  onProviderChange,
  onConfigChange,
  agentLocked = false,
  modelsLocked = false,
  modesLocked = false,
  modelsLoading = false,
  modelsReloading = false,
  onEmptyModelsOpen,
  onLoadModels,
  configOnly = false,
  menuSide = "top",
  menuInline = false,
  ...promptProps
}: ChatAgentConfigInputProps) {
  const t = useTranslations("Agent.components");
  const { favoriteModels, toggleFavorite } = useAgentChatFavorites();
  const [railTab, setRailTab] = useState(registryId || "");
  const favoritesOpen = railTab === AGENT_CHAT_FAVORITES_TAB;
  const contestedFamilies = contestedChatAgentFamilies(installedAgents);
  const agentsLocked = agentLocked || !onProviderChange;
  const agentOptions: PromptModel[] = installedAgents.map((agent) => {
    const family = chatAgentFamily(agent.id);
    const kind = chatAgentKind(agent);
    const showKindChip = Boolean(family && kind && contestedFamilies.has(family));
    return {
      value: agent.id,
      label: agent.name,
      icon: (
        <AgentIcon
          registryId={agent.id}
          name={agent.name}
          size={20}
          isCustom={agent.install_method === "custom"}
          registryIcon={agent.icon}
        />
      ),
      trailing: showKindChip ? (
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
            kind === "native"
              ? "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400"
              : "border-border/70 bg-muted/60 text-muted-foreground",
          )}
        >
          {kind === "native" ? t("agentKind.native") : t("agentKind.acp")}
        </span>
      ) : undefined,
    };
  });
  const catalogModels: PromptModel[] = toPromptModels(modelOption, undefined, {
    fastEnabled: isFastOnValue(resolvedConfigOptionValue(fastOption, "fast")),
  }).map((option) => ({
    ...option,
    agent: registryId || undefined,
    favorited: Boolean(
      registryId && isFavoriteModel(favoriteModels, registryId, option.value),
    ),
  }));
  const cachedOptions = readComposerLocalCache().optionsByAgent;
  const currentModelValue = modelOption?.currentValue || "";
  const favoritePromptModels: PromptModel[] = orderFavoriteModels(
    favoriteModels,
    installedAgents,
  ).map((favorite) => {
    const agent = installedAgents.find((item) => item.id === favorite.agentId);
    const catalog = favorite.agentId === registryId
      ? (modelOption?.options ?? []).map((entry) => ({
          id: entry.value,
          label: entry.name || entry.value,
          name: entry.name,
        }))
      : (cachedOptions[favorite.agentId]?.models ?? []).map((entry) => ({
          id: entry.id,
          label: entry.label,
          name: entry.label,
        }));
    const otherAgent = favorite.agentId !== (registryId || "");
    return {
      value: favorite.model,
      label: resolveFavoriteModelLabel(favorite, catalog),
      group: agent?.name || favorite.agentId,
      agent: favorite.agentId,
      favorited: true,
      selected: favorite.agentId === registryId && favorite.model === currentModelValue,
      disabled:
        !agent
        || (agentsLocked && otherAgent)
        || (modelsLocked && (otherAgent || favorite.model !== currentModelValue)),
    };
  });

  useEffect(() => {
    if (favoritesOpen) return;
    if (registryId) setRailTab(registryId);
  }, [favoritesOpen, registryId]);

  if (configOnly && installedAgents.length === 0) {
    return (
      <span className="px-2 py-1.5 text-xs text-muted-foreground">
        {t("composer.noAgent")}
      </span>
    );
  }

  return (
    <AgentsPromptInput
      {...promptProps}
      configOnly={configOnly}
      menuSide={menuSide}
      menuInline={menuInline}
      agents={agentOptions}
      agent={registryId || installedAgents[0]?.id || ""}
      agentLocked={agentLocked || !onProviderChange}
      onAgentChange={onProviderChange}
      agentTablist={
        agentOptions.length === 0 ? null : (
          <CenterStageTabList
            orientation="vertical"
            className="h-full min-h-0 px-0 py-0"
            value={
              favoritesOpen
                ? AGENT_CHAT_FAVORITES_TAB
                : registryId || agentOptions[0]?.value || AGENT_CHAT_FAVORITES_TAB
            }
            onValueChange={(value) => {
              if (value === AGENT_CHAT_FAVORITES_TAB) {
                setRailTab(AGENT_CHAT_FAVORITES_TAB);
                return;
              }
              setRailTab(value);
              if (agentsLocked || value === registryId) return;
              onProviderChange?.(value);
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
                      value={AGENT_CHAT_FAVORITES_TAB}
                      aria-label={t("composer.favorites")}
                      title={t("composer.favorites")}
                      className="size-9 px-0"
                    >
                      <Star
                        className={cn(
                          "size-4",
                          favoritesOpen && "fill-current",
                        )}
                      />
                    </CenterStageTab>
                  </span>
                </TooltipTrigger>
                <TooltipContent side={menuInline ? "right" : "left"} className="z-[10000]">
                  {t("composer.favorites")}
                </TooltipContent>
              </Tooltip>
              <div
                aria-hidden
                className="mx-auto my-1 h-px w-5 bg-border/80"
              />
              <div className={cn("flex flex-col items-center", agentsLocked && "opacity-40")}>
                {agentOptions.map((option) => {
                  const label = typeof option.label === "string" ? option.label : option.value;
                  return (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <CenterStageTab
                            value={option.value}
                            disabled={option.disabled || agentsLocked}
                            aria-label={label}
                            title={agentsLocked ? t("composer.agentLocked") : label}
                            className="size-9 px-0"
                          >
                            {option.icon}
                          </CenterStageTab>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side={menuInline ? "right" : "left"} className="z-[10000]">
                        {agentsLocked ? (
                          t("composer.agentLocked")
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
              </div>
            </CenterStageScrollableTabs>
          </CenterStageTabList>
        )
      }
      models={catalogModels}
      model={currentModelValue}
      favoriteModels={favoritePromptModels}
      favoritesOpen={favoritesOpen}
      onToggleFavorite={(model, option) => {
        const agentId = option.agent?.trim() || registryId || "";
        if (!agentId || !model.trim()) return;
        const label = typeof option.label === "string" && option.label.trim()
          ? option.label
          : model;
        toggleFavorite({ agentId, model, label });
      }}
      onModelChange={(value, option) => {
        const agentId = option?.agent?.trim();
        if (agentId && agentId !== (registryId || "")) {
          if (agentsLocked) return;
          onProviderChange?.(agentId, { model: value });
          return;
        }
        onConfigChange("model", value);
      }}
      modelsLocked={modelsLocked}
      modelsLoading={modelsLoading}
      modelsReloading={modelsReloading}
      onEmptyModelsOpen={onEmptyModelsOpen}
      onLoadModels={onLoadModels}
      modes={toModePromptModels(modeOption)}
      mode={resolvedConfigOptionValue(modeOption, "mode")}
      onModeChange={(value) => onConfigChange("mode", value)}
      modesLocked={modesLocked}
      permissionModes={toPermissionPromptModels(
        permissionOption,
        (kind, key) => t(`chatPanel.pickers.${kind}.${key}`),
      )}
      permissionMode={resolvedConfigOptionValue(permissionOption, "permission_mode")}
      onPermissionModeChange={(value) => onConfigChange("permission_mode", value)}
      thinkingLevels={toPromptModels(thinkingOption, (value, name) => {
        const key = thinkingLevelMessageKey(value);
        return key ? t(`chatPanel.pickers.thinkingLevels.${key}`) : (name || value);
      })}
      thinking={resolvedConfigOptionValue(thinkingOption, "thinking")}
      onThinkingChange={(value) => onConfigChange("thinking", value)}
      fastAvailable={Boolean(fastOption && fastOption.options.length > 0)}
      fastEnabled={isFastOnValue(resolvedConfigOptionValue(fastOption, "fast"))}
      onFastChange={(enabled) => {
        const next = resolveFastToggleValue(fastOption, enabled);
        if (next) onConfigChange("fast", next);
      }}
      contextLevels={toPromptModels(contextOption)}
      context={resolvedConfigOptionValue(contextOption, "context")}
      onContextChange={(value) => onConfigChange("context", value)}
      labels={{
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
        noResults: t("configOptionDropdown.noResults"),
        loadingModels: t("composer.loadingModels"),
        loadModels: t("composer.loadModels"),
        reloadModels: t("composer.reloadModels"),
        thinkingEffort: t("composer.thinkingEffort"),
        fastMode: t("composer.fastMode"),
        fastChip: t("composer.fastChip"),
        context: t("composer.context"),
        addFavorite: t("composer.addFavorite"),
        removeFavorite: t("composer.removeFavorite"),
        noFavorites: t("composer.noFavorites"),
      }}
    />
  );
}
