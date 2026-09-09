"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  AgentsPromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptModel,
} from "@workspace/ui";
import {
  CenterStageScrollableTabs,
  CenterStageTab,
  CenterStageTabList,
} from "@/app-shell/center-stage-shared-tabs";
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
  PencilSparkles,
  Shield,
  ShieldAlert,
} from "lucide-react";
import {
  PromptComposer,
  type ComposerHandle,
} from "@/features/welcome/components/PromptComposer";
import { AgentIcon } from "./AgentIcon";
import { useDialogStore, type QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentPlan, AgentConfigOption } from "@/features/agent/lib/agent-chat-types";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/features/agent/types/index";
import {
  chatAgentFamily,
  chatAgentKind,
  contestedChatAgentFamilies,
} from "@/features/agent/lib/custom-agent-registry";
import {
  registerActiveAgentComposer,
  touchActiveAgentComposer,
} from "@/features/agent/lib/agent/active-composer";
import type { AgentMessage, AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { stopStreamingMessages } from "@/features/agent/lib/agent-chat-events";
import { expandAgentComposerText } from "@/features/agent/lib/agent-chat-slash-command";
import { stripSkillDisableSession } from "@/features/skills/lib/skill-disable-protocol";
import { resolveAgentComposerPlaceholderKind } from "@/features/agent/lib/agent-composer-placeholder";
import type { AgentActivity } from "../lib/chat-helpers";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { PlanBlockView } from "./PlanBlockView";
import { BackgroundCommandsDock } from "./BackgroundCommandsDock";
import { MessageQueueDock } from "./MessageQueueDock";
import { useAgentComposerPopovers } from "../hooks/use-agent-composer-popovers";
import type { AgentChatSlashCommand } from "../hooks/use-agent-chat-session";
import {
  configKindMatches,
  displayedComposerConfigValue,
  isThinkingConfigId,
  permissionModeMessageKey,
  thinkingLevelMessageKey,
} from "../lib/agent-chat-thread";
import { AgentChatWorkingDirectoryPicker } from "./AgentChatWorkingDirectoryPicker";
import { AgentComposerAttachments } from "./AgentComposerAttachments";
import {
  ContextUsageDetailsPanel,
  ContextWindowUsageControl,
} from "./UsageBadges";
import { contextWindowStats } from "@/features/agent/lib/context-window-usage";
import type { AgentChatWorkingDirectory } from "@/features/agent/lib/agent-chat-working-directory";
import type { Project } from "@/shared/types/domain";
import {
  getAgentContextDragItems,
  hasAgentContextDragData,
} from "@/shared/lib/agent-context-drag";
import { normalizeComposerImageFile } from "@/shared/lib/composer-image";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import {
  composerFileUrlFromPath,
  filesFromComposerParts,
  filesFromQueuedPrompt,
  queuedPromptEditText,
} from "@/features/agent/lib/agent-composer-attachment";

function AttachmentFileInput() {
  const controller = usePromptInputController();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = useCallback(() => inputRef.current?.click(), []);

  useEffect(() => {
    controller.__registerFileInput(inputRef, open);
  }, [controller, open]);

  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      onChange={(event) => {
        const selected = event.currentTarget.files
          ? Array.from(event.currentTarget.files)
          : [];
        event.currentTarget.value = "";
        if (selected.length === 0) return;
        void (async () => {
          const files = await Promise.all(
            selected.map((file) => normalizeComposerImageFile(file)),
          );
          controller.attachments.add(files);
        })();
      }}
    />
  );
}

function toPromptModels(
  option: AgentConfigOption | null,
  localize?: (value: string, name?: string) => string,
): PromptModel[] {
  if (!option) return [];
  return option.options.map((entry) => ({
    value: entry.value,
    label: localize ? localize(entry.value, entry.name) : (entry.name || entry.value),
    group: entry.group,
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
    case "build":
      return <Hammer className="size-3.5 shrink-0" />;
    case "code":
      return <Code2 className="size-3.5 shrink-0" />;
    case "ask":
      return <MessageCircleQuestionMark className="size-3.5 shrink-0" />;
    case "agent":
      return <BotMessageSquare className="size-3.5 shrink-0" />;
    case "default":
    case "normal":
      return <MessageSquare className="size-3.5 shrink-0" />;
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

/** Prefer currentValue when listed; otherwise the default / first option. */
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

async function filesForSubmit(
  files: Array<{ id: string; url?: string } & import("ai").FileUIPart>,
): Promise<import("ai").FileUIPart[]> {
  return Promise.all(
    files.map(async ({ id: _id, ...item }) => {
      if (!item.url?.startsWith("blob:")) return item;
      try {
        const blob = await fetch(item.url).then((response) => response.blob());
        const dataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        return { ...item, url: dataUrl ?? item.url };
      } catch {
        return item;
      }
    }),
  );
}

async function filesFromQueuedItem(item: QueuedAgentPrompt): Promise<File[]> {
  if (item.files && item.files.length > 0) {
    return filesFromComposerParts(item.files);
  }
  const paths = item.attachmentPaths ?? [];
  if (paths.length === 0) return [];
  const cfg = await getRuntimeApiConfig();
  const base = httpBase(cfg);
  return filesFromQueuedPrompt(
    item,
    base ? (path) => composerFileUrlFromPath(path, base, cfg.token) : undefined,
  );
}

function ComposerPromptInput({
  composerRef,
  onAtTrigger,
  onAtCancel,
  onSlashTrigger,
  onSlashCancel,
  onSkillDisableFilterChange,
  onSkillDisableSessionClosed,
  skillDisableSessionOpen,
  closePopovers,
  localDraft,
  setLocalDraft,
  persistedDraftRef,
  canUseCurrentMode,
  isConnected,
  chatMode,
  instanceKey,
  sessionWorkspaceId,
  sessionProjectId,
  loadingAgents,
  isConnecting,
  isResumingHistory,
  catalogModelsLoading,
  catalogModelsReloading,
  onEmptyModelsOpen,
  onLoadModels,
  installedAgents,
  modeOption,
  permissionOption,
  modelOption,
  thinkingOption,
  fastOption,
  contextOption,
  modelsLocked,
  modesLocked,
  registryId,
  agentLocked,
  onProviderChange,
  setConfigOption,
  showStop,
  sendCancel,
  setWaitingForResponse,
  setMessages,
  stoppedRef,
  workingDirectoryPicker,
  clearAgentChatDraft,
  onSubmit,
  placeholder,
  landing,
  editingItem,
  onFinishEdit,
  onUpdateQueuedPrompt,
  sessionUsage,
  contextUsageOpen,
  onContextUsageOpenChange,
}: {
  composerRef: React.RefObject<ComposerHandle | null>;
  onAtTrigger: (ctx: import("@/features/welcome/components/PromptComposer").AtTriggerContext) => void;
  onAtCancel: () => void;
  onSlashTrigger: (ctx: import("@/features/welcome/components/PromptComposer").SlashTriggerContext) => void;
  onSlashCancel: () => void;
  onSkillDisableFilterChange: (filter: string) => void;
  onSkillDisableSessionClosed: () => void;
  skillDisableSessionOpen: boolean;
  closePopovers: () => void;
  localDraft: string;
  setLocalDraft: React.Dispatch<React.SetStateAction<string>>;
  persistedDraftRef: React.MutableRefObject<string>;
  canUseCurrentMode: boolean;
  isConnected: boolean;
  chatMode: AgentChatMode;
  instanceKey?: string | null;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  loadingAgents: boolean;
  isConnecting: boolean;
  isResumingHistory: boolean;
  catalogModelsLoading: boolean;
  catalogModelsReloading?: boolean;
  onEmptyModelsOpen?: () => void;
  onLoadModels?: () => void;
  installedAgents: RegistryAgent[];
  modeOption: AgentConfigOption | null;
  permissionOption: AgentConfigOption | null;
  modelOption: AgentConfigOption | null;
  thinkingOption: AgentConfigOption | null;
  fastOption: AgentConfigOption | null;
  contextOption: AgentConfigOption | null;
  modelsLocked: boolean;
  modesLocked: boolean;
  registryId: string | null;
  agentLocked: boolean;
  onProviderChange?: (providerId: string) => void;
  setConfigOption: (id: string, value: string) => void;
  showStop: boolean;
  sendCancel: () => void;
  setWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
  stoppedRef: React.MutableRefObject<boolean>;
  workingDirectoryPicker: {
    projects: Project[];
    selection: AgentChatWorkingDirectory;
    onSelect: (next: AgentChatWorkingDirectory) => void;
  } | null;
  placeholder: string;
  clearAgentChatDraft: (
    workspaceId: string | null,
    projectId: string | null,
    mode: AgentChatMode,
    instanceKey?: string | null,
  ) => void;
  onSubmit: (
    message: { text: string; files?: import("ai").FileUIPart[] },
    options?: { oneShot?: "queue" | "steer" },
  ) => Promise<void>;
  landing: boolean;
  editingItem: QueuedAgentPrompt | null;
  onFinishEdit: () => void;
  onUpdateQueuedPrompt: (id: string, prompt: string) => void | Promise<void>;
  sessionUsage: AgentSessionUsage | null;
  contextUsageOpen: boolean;
  onContextUsageOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Agent.components");
  const attachments = usePromptInputAttachments();
  const formRef = useRef<HTMLFormElement>(null);
  const hydratedRef = useRef(false);
  const stashRef = useRef<{ text: string; files: File[] } | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const contestedFamilies = contestedChatAgentFamilies(installedAgents);
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
  const composerLocked = isResumingHistory && !isConnected;
  const agentsLocked = agentLocked || !onProviderChange;
  const canSubmit = Boolean(
    expandAgentComposerText(localDraft) || attachments.files.length,
  ) && !composerLocked && !showStop;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const restored = stripSkillDisableSession(localDraft);
    if (restored) composerRef.current?.setText(restored);
    if (restored !== localDraft) setLocalDraft(restored);
  }, [composerRef, localDraft, setLocalDraft]);

  useEffect(() => {
    const applyDraft = (text: string, files: File[]) => {
      const current = attachmentsRef.current;
      setLocalDraft(text);
      composerRef.current?.setText(text);
      current.clear();
      if (files.length > 0) current.add(files);
    };

    if (!editingItem) {
      const stash = stashRef.current;
      if (!stash) return;
      stashRef.current = null;
      applyDraft(stash.text, stash.files);
      return;
    }

    const item = editingItem;
    let cancelled = false;
    void (async () => {
      if (!stashRef.current) {
        stashRef.current = {
          text: composerRef.current?.getText() ?? localDraft,
          files: await filesFromComposerParts(attachmentsRef.current.files),
        };
      }
      if (cancelled) return;
      const text = queuedPromptEditText(item);
      applyDraft(text, []);
      const files = await filesFromQueuedItem(item);
      if (cancelled) return;
      if (files.length > 0) attachmentsRef.current.add(files);
      composerRef.current?.focus();
    })();

    return () => {
      cancelled = true;
    };
    // Load once per queued item. Stash is captured on first enter and restored when editing ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- localDraft/attachments would retrigger mid-edit
  }, [composerRef, editingItem?.id, setLocalDraft]);

  return (
    <>
      <AttachmentFileInput />
      <AgentsPromptInput
        value={localDraft}
        onValueChange={setLocalDraft}
        disabled={composerLocked}
        loading={showStop}
        canSubmit={canSubmit}
        minRows={landing ? 2 : 1}
        maxRows={8}
        formRef={formRef}
        placeholder={placeholder}
        editor={
          <PromptComposer
            ref={composerRef}
            submitOnEnter={!skillDisableSessionOpen}
            disabled={composerLocked}
            placeholder={placeholder}
            editorClassName={
              landing
                ? "min-h-16 max-h-40 select-text rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"
                : "min-h-5 max-h-40 select-text rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"
            }
            placeholderClassName="left-0 top-0 text-sm leading-5 text-muted-foreground/55"
            onTextChange={setLocalDraft}
            onAtTrigger={onAtTrigger}
            onAtCancel={onAtCancel}
            onSlashTrigger={onSlashTrigger}
            onSlashCancel={onSlashCancel}
            onSkillDisableFilterChange={onSkillDisableFilterChange}
            onSkillDisableSessionClosed={onSkillDisableSessionClosed}
            onImagePaste={(blob, ext) => {
              const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
              attachments.add([
                new File([blob], `paste.${safeExt}`, {
                  type: blob.type || `image/${safeExt}`,
                }),
              ]);
            }}
            onSubmit={() => formRef.current?.requestSubmit()}
          />
        }
        agents={agentOptions}
        agent={registryId || installedAgents[0]?.id || ""}
        agentLocked={agentLocked || !onProviderChange}
        onAgentChange={onProviderChange}
        agentTablist={
          agentOptions.length === 0 ? null : (
            <CenterStageTabList
              orientation="vertical"
              className={cn(
                "h-full min-h-0 px-0 py-0",
                agentsLocked && "opacity-40",
              )}
              value={registryId || agentOptions[0]?.value || ""}
              onValueChange={agentsLocked ? undefined : onProviderChange}
            >
              <CenterStageScrollableTabs
                orientation="vertical"
                className="max-h-[min(22rem,calc(100dvh-8rem))]"
              >
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
                      <TooltipContent side="left" className="z-[10000]">
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
              </CenterStageScrollableTabs>
            </CenterStageTabList>
          )
        }
        models={toPromptModels(modelOption)}
        model={modelOption?.currentValue || ""}
        onModelChange={(value) => modelOption && setConfigOption(modelOption.id, value)}
        modelsLocked={modelsLocked}
        modelsLoading={isConnecting || isResumingHistory || catalogModelsLoading}
        modelsReloading={catalogModelsReloading}
        onEmptyModelsOpen={onEmptyModelsOpen}
        onLoadModels={onLoadModels}
        modes={toModePromptModels(modeOption)}
        mode={resolvedConfigOptionValue(modeOption, "mode")}
        onModeChange={(value) => modeOption && setConfigOption(modeOption.id, value)}
        modesLocked={modesLocked}
        permissionModes={toPermissionPromptModels(
          permissionOption,
          (kind, key) => t(`chatPanel.pickers.${kind}.${key}`),
        )}
        permissionMode={resolvedConfigOptionValue(permissionOption, "permission_mode")}
        onPermissionModeChange={(value) =>
          permissionOption && setConfigOption(permissionOption.id, value)
        }
        thinkingLevels={toPromptModels(thinkingOption, (value, name) => {
          const key = thinkingLevelMessageKey(value);
          return key ? t(`chatPanel.pickers.thinkingLevels.${key}`) : (name || value);
        })}
        thinking={resolvedConfigOptionValue(thinkingOption, "thinking")}
        onThinkingChange={(value) => thinkingOption && setConfigOption(thinkingOption.id, value)}
        fastAvailable={Boolean(fastOption && fastOption.options.length > 0)}
        fastEnabled={isFastOnValue(resolvedConfigOptionValue(fastOption, "fast"))}
        onFastChange={(enabled) => {
          if (!fastOption) return;
          const next = resolveFastToggleValue(fastOption, enabled);
          if (next) setConfigOption(fastOption.id, next);
        }}
        contextLevels={toPromptModels(contextOption)}
        context={resolvedConfigOptionValue(contextOption, "context")}
        onContextChange={(value) => contextOption && setConfigOption(contextOption.id, value)}
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
        }}
        leadingAction={
          <div className="flex min-w-0 items-center gap-1">
            <PromptInputAddAttachmentsButton className="rounded-2xl bg-transparent shadow-none hover:bg-muted/60 data-pressed:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60" />
            {workingDirectoryPicker ? (
              <AgentChatWorkingDirectoryPicker
                className="rounded-2xl"
                projects={workingDirectoryPicker.projects}
                selection={workingDirectoryPicker.selection}
                onSelect={workingDirectoryPicker.onSelect}
              />
            ) : null}
            {(loadingAgents || isConnecting || isResumingHistory) && !isConnected ? null : installedAgents.length === 0 ? (
              <span className="px-2 text-xs text-muted-foreground">{t("composer.noAgent")}</span>
            ) : null}
          </div>
        }
        header={<AgentComposerAttachments />}
        onSubmit={async (text) => {
          const composed = expandAgentComposerText(composerRef.current?.getText() ?? text);
          if (editingItem) {
            if (!composed.trim()) return;
            closePopovers();
            await onUpdateQueuedPrompt(editingItem.id, composed);
            onFinishEdit();
            return;
          }
          const files = attachments.files;
          const previousDraft = localDraft;
          if (!composed && files.length === 0) {
            setLocalDraft(previousDraft);
            return;
          }
          const converted = await filesForSubmit(files);
          closePopovers();
          setLocalDraft("");
          composerRef.current?.clear();
          persistedDraftRef.current = "";
          clearAgentChatDraft(
            sessionWorkspaceId,
            sessionProjectId,
            chatMode,
            instanceKey,
          );
          attachments.clear();
          try {
            await onSubmit({ text: composed, files: converted });
          } catch {
            setLocalDraft(previousDraft);
            composerRef.current?.setText(previousDraft);
            persistedDraftRef.current = previousDraft;
            const restored = await filesFromComposerParts(converted);
            if (restored.length > 0) attachmentsRef.current.add(restored);
          }
        }}
        onStop={
          showStop
            ? () => {
                stoppedRef.current = true;
                sendCancel();
                setWaitingForResponse(false);
                setMessages(stopStreamingMessages);
              }
            : undefined
        }
        radius="3xl"
        footerTrailing={
          <ContextWindowUsageControl
            usage={sessionUsage}
            providerId={registryId}
            open={contextUsageOpen}
            onOpenChange={onContextUsageOpenChange}
          />
        }
        className={cn(
          "w-full shadow-none",
          editingItem && "border-dashed border-info",
        )}
      />
    </>
  );
}

export const AgentPromptComposer = React.memo(function AgentPromptComposer({
  currentPlan,
  isResumedSession,
  backgroundTools = [],
  queuedPrompts,
  onRemoveQueuedPrompt,
  onUpdateQueuedPrompt,
  onMoveQueuedPrompt,
  onSubmit,
  agentLocked = false,
  onProviderChange,
  canUseCurrentMode,
  isConnected,
  chatMode,
  instanceKey,
  sessionWorkspaceId,
  sessionProjectId,
  loadingAgents,
  isConnecting,
  isResumingHistory,
  catalogModelsLoading = false,
  catalogModelsReloading = false,
  onEmptyModelsOpen,
  onLoadModels,
  chatId = null,
  runtimeStatus = null,
  hasPersistenceHandle = false,
  installedAgents,
  configOptions,
  modelsLocked = false,
  modesLocked = false,
  registryId,
  activeAgent,
  setConfigOption,
  agentActivity,
  sendCancel,
  setWaitingForResponse,
  setMessages,
  stoppedRef,
  projectPath = null,
  availableCommands = [],
  workingDirectoryPicker = null,
  landing = false,
  sessionUsage = null,
  aboveInputOverlay = null,
  onAboveComposerOverlaysNodeChange,
}: {
  currentPlan: AgentPlan | null;
  isResumedSession: boolean;
  backgroundTools?: AgentToolCallPart[];
  queuedPrompts: QueuedAgentPrompt[];
  onRemoveQueuedPrompt: (id: string) => void;
  onUpdateQueuedPrompt: (id: string, prompt: string) => void | Promise<void>;
  onMoveQueuedPrompt: (id: string, toIndex: number) => void;
  onSubmit: (
    message: { text: string; files?: import("ai").FileUIPart[] },
    options?: { oneShot?: "queue" | "steer" },
  ) => Promise<void>;
  agentLocked?: boolean;
  onProviderChange?: (providerId: string) => void;
  canUseCurrentMode: boolean;
  isConnected: boolean;
  chatMode: AgentChatMode;
  instanceKey?: string | null;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  loadingAgents: boolean;
  isConnecting: boolean;
  isResumingHistory: boolean;
  catalogModelsLoading?: boolean;
  catalogModelsReloading?: boolean;
  onEmptyModelsOpen?: () => void;
  onLoadModels?: () => void;
  chatId?: string | null;
  runtimeStatus?: string | null;
  hasPersistenceHandle?: boolean;
  installedAgents: RegistryAgent[];
  configOptions: AgentConfigOption[];
  modelsLocked?: boolean;
  modesLocked?: boolean;
  registryId: string | null;
  activeAgent: RegistryAgent | null;
  setConfigOption: (id: string, value: string) => void;
  agentActivity: AgentActivity;
  sendCancel: () => void;
  setWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
  stoppedRef: React.MutableRefObject<boolean>;
  projectPath?: string | null;
  availableCommands?: AgentChatSlashCommand[];
  workingDirectoryPicker?: {
    projects: Project[];
    selection: AgentChatWorkingDirectory;
    onSelect: (next: AgentChatWorkingDirectory) => void;
  } | null;
  landing?: boolean;
  sessionUsage?: AgentSessionUsage | null;
  /** Approve / session-op cards — floated in the same lane as context usage. */
  aboveInputOverlay?: React.ReactNode;
  onAboveComposerOverlaysNodeChange?: (node: HTMLDivElement | null) => void;
}) {
  const t = useTranslations("Agent.components");
  const setAgentChatDraft = useDialogStore((s) => s.setAgentChatDraft);
  const clearAgentChatDraft = useDialogStore((s) => s.clearAgentChatDraft);
  const [localDraft, setLocalDraft] = useState(() =>
    useDialogStore.getState().getAgentChatDraft(
      sessionWorkspaceId,
      sessionProjectId,
      chatMode,
      instanceKey,
    ),
  );
  const persistedDraftRef = useRef(localDraft);
  const composerRef = useRef<ComposerHandle | null>(null);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [contextUsageOpen, setContextUsageOpen] = useState(false);
  const editingItem = editingQueueId
    ? queuedPrompts.find((item) => item.id === editingQueueId) ?? null
    : null;
  const showStop = Boolean(agentActivity.busy && !localDraft.trim() && !editingItem);
  const contextStats = contextWindowStats(sessionUsage);
  const showContextUsageCard = contextUsageOpen && contextStats != null;
  const hasUpperComposerCards =
    Boolean(currentPlan)
    || backgroundTools.length > 0
    || queuedPrompts.length > 0;
  const reduceOverlayMotion = Boolean(useReducedMotion());

  useEffect(() => {
    if (!editingQueueId) return;
    if (queuedPrompts.some((item) => item.id === editingQueueId)) return;
    setEditingQueueId(null);
  }, [editingQueueId, queuedPrompts]);

  useEffect(() => {
    if (contextStats != null || !contextUsageOpen) return;
    setContextUsageOpen(false);
  }, [contextStats, contextUsageOpen]);

  useEffect(() => {
    return () => onAboveComposerOverlaysNodeChange?.(null);
  }, [onAboveComposerOverlaysNodeChange]);
  const modeOption = configOptions.find((option) => configKindMatches(option.id, option.category, "mode")) ?? null;
  const permissionOption =
    configOptions.find((option) =>
      configKindMatches(option.id, option.category, "permission_mode"),
    ) ?? null;
  const modelOption = configOptions.find((option) => configKindMatches(option.id, option.category, "model")) ?? null;
  const thinkingOption =
    configOptions.find((option) => isThinkingConfigId(option.id, option.category)) ?? null;
  const fastOption =
    configOptions.find((option) => configKindMatches(option.id, option.category, "fast")) ?? null;
  const contextOption =
    configOptions.find((option) => configKindMatches(option.id, option.category, "context")) ?? null;
  const placeholderKind = resolveAgentComposerPlaceholderKind({
    canUseCurrentMode,
    agentName: activeAgent?.name,
    chatId,
    runtimeStatus,
    hasPersistenceHandle,
  });
  const placeholder = t(`composer.placeholder.${placeholderKind}`, {
    agent: activeAgent?.name ?? "",
  });
  const {
    popovers,
    closePopovers,
    onAtTrigger,
    onAtCancel,
    onSlashTrigger,
    onSlashCancel,
    onSkillDisableFilterChange,
    onSkillDisableSessionClosed,
    skillDisableSessionOpen,
  } = useAgentComposerPopovers({
    availableCommands,
    projectPath,
    composerRef,
    activeProjectId: sessionProjectId,
    sessionWorkspaceId,
    agentName: activeAgent?.name,
  });

  useEffect(() => {
    return registerActiveAgentComposer(
      sessionWorkspaceId,
      sessionProjectId,
      chatMode,
      {
        setDraft: (updater) => {
          const current = composerRef.current?.getText() ?? "";
          const next = typeof updater === "function" ? updater(current) : updater;
          setLocalDraft(next);
          composerRef.current?.setText(next);
        },
        insertAiContext: (kind, promptText) => {
          composerRef.current?.focus();
          composerRef.current?.insertAiContext(kind, promptText);
        },
        focus: () => composerRef.current?.focus(),
      },
      instanceKey,
    );
  }, [chatMode, instanceKey, sessionProjectId, sessionWorkspaceId]);

  useEffect(() => {
    if (editingItem) return;
    const toPersist = stripSkillDisableSession(localDraft);
    if (toPersist === persistedDraftRef.current) return;

    const timer = window.setTimeout(() => {
      setAgentChatDraft(
        sessionWorkspaceId,
        sessionProjectId,
        chatMode,
        toPersist,
        instanceKey,
      );
      persistedDraftRef.current = toPersist;
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    chatMode,
    editingItem,
    instanceKey,
    localDraft,
    sessionProjectId,
    sessionWorkspaceId,
    setAgentChatDraft,
  ]);

  return (
    <div
      className="shrink-0 px-3 pb-3 pt-px select-none"
      data-agent-chat-composer=""
      data-agent-chat-mode={chatMode}
      data-agent-chat-instance-key={instanceKey?.trim() || undefined}
      data-agent-chat-workspace-id={sessionWorkspaceId ?? undefined}
      data-agent-chat-project-id={sessionProjectId ?? undefined}
      data-queue-editing={editingItem ? "true" : undefined}
      onFocusCapture={() => {
        touchActiveAgentComposer(
          sessionWorkspaceId,
          sessionProjectId,
          chatMode,
          instanceKey,
        );
      }}
      onDragOver={(event) => {
        if (!isConnected || !canUseCurrentMode) return;
        if (!hasAgentContextDragData(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        composerRef.current?.placeCaretAtClientPoint(event.clientX, event.clientY);
      }}
      onDrop={(event) => {
        if (!isConnected || !canUseCurrentMode) return;
        const items = getAgentContextDragItems(event.dataTransfer);
        if (!items) return;
        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.placeCaretAtClientPoint(event.clientX, event.clientY);
        for (const item of items) {
          const path =
            item.kind === "directory" && !item.path.endsWith("/")
              ? `${item.path}/`
              : item.path;
          composerRef.current?.insertFileMention(path);
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || !editingQueueId) return;
        setEditingQueueId(null);
      }}
    >
      <div className="relative">
        <div
          ref={onAboveComposerOverlaysNodeChange}
          data-agent-chat-above-composer-overlays=""
          className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex w-full flex-col gap-2 has-[.pointer-events-auto]:pb-2"
        >
          <div
            data-agent-chat-scroll-button-host=""
            className="flex justify-center empty:hidden"
          />
          <div
            className={cn(
              "flex w-full min-h-0 flex-col gap-2 empty:hidden",
              hasUpperComposerCards && "px-6",
            )}
          >
            <AnimatePresence initial={false}>
              {showContextUsageCard ? (
                <motion.div
                  key="agent-context-usage"
                  className="pointer-events-auto w-full"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: 10,
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    transition: reduceOverlayMotion
                      ? { duration: 0 }
                      : { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  <ContextUsageDetailsPanel
                    usage={sessionUsage}
                    providerId={registryId}
                    onClose={() => setContextUsageOpen(false)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            {aboveInputOverlay}
          </div>
        </div>
        {hasUpperComposerCards ? (
          <div
            data-agent-composer-upper-cards=""
            className="relative z-[1] mx-6 -mb-px overflow-hidden rounded-t-3xl border border-b-0 border-foreground/10 bg-foreground/[0.04]"
          >
            {currentPlan ? (
              <div className={
                backgroundTools.length > 0 || queuedPrompts.length > 0
                  ? "border-b border-foreground/10"
                  : ""
              }>
                <PlanBlockView
                  plan={currentPlan}
                  embedded
                  defaultOpen={!isResumedSession}
                />
              </div>
            ) : null}
            {backgroundTools.length > 0 ? (
              <div className={queuedPrompts.length > 0 ? "border-b border-foreground/10" : ""}>
                <BackgroundCommandsDock tools={backgroundTools} />
              </div>
            ) : null}
            {queuedPrompts.length > 0 ? (
              <MessageQueueDock
                items={queuedPrompts}
                editingPromptId={editingQueueId}
                onToggleEdit={(item) => {
                  setEditingQueueId((current) => (current === item.id ? null : item.id));
                }}
                onRemove={(id) => {
                  onRemoveQueuedPrompt(id);
                  setEditingQueueId((current) => (current === id ? null : current));
                }}
                onMove={onMoveQueuedPrompt}
              />
            ) : null}
          </div>
        ) : null}
        <PromptInputProvider>
          <ComposerPromptInput
            composerRef={composerRef}
            onAtTrigger={onAtTrigger}
            onAtCancel={onAtCancel}
            onSlashTrigger={onSlashTrigger}
            onSlashCancel={onSlashCancel}
            onSkillDisableFilterChange={onSkillDisableFilterChange}
            onSkillDisableSessionClosed={onSkillDisableSessionClosed}
            skillDisableSessionOpen={skillDisableSessionOpen}
            closePopovers={closePopovers}
            localDraft={localDraft}
            setLocalDraft={setLocalDraft}
            persistedDraftRef={persistedDraftRef}
            canUseCurrentMode={canUseCurrentMode}
            isConnected={isConnected}
            chatMode={chatMode}
            instanceKey={instanceKey}
            sessionWorkspaceId={sessionWorkspaceId}
            sessionProjectId={sessionProjectId}
            loadingAgents={loadingAgents}
            isConnecting={isConnecting}
            isResumingHistory={isResumingHistory}
            catalogModelsLoading={catalogModelsLoading}
            catalogModelsReloading={catalogModelsReloading}
            onEmptyModelsOpen={onEmptyModelsOpen}
            onLoadModels={onLoadModels}
            installedAgents={installedAgents}
            modeOption={modeOption}
            permissionOption={permissionOption}
            modelOption={modelOption}
            thinkingOption={thinkingOption}
            fastOption={fastOption}
            contextOption={contextOption}
            modelsLocked={modelsLocked}
            modesLocked={modesLocked}
            registryId={registryId}
            agentLocked={agentLocked}
            onProviderChange={onProviderChange}
            setConfigOption={setConfigOption}
            showStop={showStop}
            sendCancel={sendCancel}
            setWaitingForResponse={setWaitingForResponse}
            setMessages={setMessages}
            stoppedRef={stoppedRef}
            workingDirectoryPicker={workingDirectoryPicker}
            clearAgentChatDraft={clearAgentChatDraft}
            onSubmit={onSubmit}
            placeholder={placeholder}
            landing={landing}
            editingItem={editingItem}
            onFinishEdit={() => setEditingQueueId(null)}
            onUpdateQueuedPrompt={onUpdateQueuedPrompt}
            sessionUsage={sessionUsage}
            contextUsageOpen={contextUsageOpen}
            onContextUsageOpenChange={setContextUsageOpen}
          />
        </PromptInputProvider>
      </div>
      {popovers}
    </div>
  );
});
