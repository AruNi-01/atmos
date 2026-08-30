"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  AgentsPromptInput,
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  PromptInputAddAttachmentsButton,
  PromptInputProvider,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptModel,
} from "@workspace/ui";
import { Bot, Brain } from "lucide-react";
import {
  PromptComposer,
  type ComposerHandle,
} from "@/features/welcome/components/PromptComposer";
import { AgentIcon } from "./AgentIcon";
import { useDialogStore, type QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentPlan, AgentConfigOption } from "@/features/agent/hooks/use-agent-session";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/features/agent/types/index";
import {
  registerActiveAgentComposer,
  touchActiveAgentComposer,
} from "@/features/agent/lib/agent/active-composer";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { stopStreamingMessages } from "@/features/agent/lib/agent-chat-events";
import { expandAgentComposerText } from "@/features/agent/lib/agent-chat-slash-command";
import { resolveAgentComposerPlaceholderKind } from "@/features/agent/lib/agent-composer-placeholder";
import type { AgentActivity } from "../lib/chat-helpers";
import { PlanBlockView } from "./PlanBlockView";
import { MessageQueueDock } from "./MessageQueueDock";
import { ConfigOptionDropdown } from "./ConfigOptionDropdown";
import { useAgentComposerPopovers } from "../hooks/use-agent-composer-popovers";
import type { AgentChatSlashCommand } from "../hooks/use-agent-chat-session";
import { isComposerTrailingConfigOption } from "../lib/agent-chat-thread";
import { AgentChatWorkingDirectoryPicker } from "./AgentChatWorkingDirectoryPicker";
import type { AgentChatWorkingDirectory } from "@/features/agent/lib/agent-chat-working-directory";
import type { Project } from "@/shared/types/domain";
import {
  getAgentContextDragItems,
  hasAgentContextDragData,
} from "@/shared/lib/agent-context-drag";

function composerConfigIcon(optionId: string) {
  const id = optionId.trim().toLowerCase();
  if (id === "thinking" || id === "think") {
    return <Brain className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (id === "mode" || id === "modes") {
    return <Bot className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return null;
}

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
        if (event.currentTarget.files?.length) {
          controller.attachments.add(event.currentTarget.files);
        }
        event.currentTarget.value = "";
      }}
    />
  );
}

function PromptInputAttachmentsSection() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <Attachments variant="inline" className="px-2 pt-1.5">
      {attachments.files.map((a) => (
        <Attachment key={a.id} data={a} onRemove={() => attachments.remove(a.id)}>
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

function configOptionById(options: AgentConfigOption[], id: string) {
  const needle = id.trim().toLowerCase();
  return options.find((option) => option.id.trim().toLowerCase() === needle) ?? null;
}

function toPromptModels(option: AgentConfigOption | null): PromptModel[] {
  if (!option) return [];
  return option.options.map((entry) => ({
    value: entry.value,
    label: entry.name || entry.value,
  }));
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

function ComposerPromptInput({
  composerRef,
  onAtTrigger,
  onAtCancel,
  onSlashTrigger,
  onSlashCancel,
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
  onEmptyModelsOpen,
  installedAgents,
  extraConfigOptions,
  modeOption,
  modelOption,
  thinkingOption,
  registryId,
  activeAgent,
  agentLocked,
  onProviderChange,
  setConfigOption,
  setAgentDefaultConfig,
  setInstalledAgents,
  showStop,
  sendCancel,
  setWaitingForResponse,
  setMessages,
  stoppedRef,
  workingDirectoryPicker,
  clearAgentChatDraft,
  onSubmit,
  placeholder,
}: {
  composerRef: React.RefObject<ComposerHandle | null>;
  onAtTrigger: (ctx: import("@/features/welcome/components/PromptComposer").AtTriggerContext) => void;
  onAtCancel: () => void;
  onSlashTrigger: (ctx: import("@/features/welcome/components/PromptComposer").SlashTriggerContext) => void;
  onSlashCancel: () => void;
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
  onEmptyModelsOpen?: () => void;
  installedAgents: RegistryAgent[];
  extraConfigOptions: AgentConfigOption[];
  modeOption: AgentConfigOption | null;
  modelOption: AgentConfigOption | null;
  thinkingOption: AgentConfigOption | null;
  registryId: string;
  activeAgent: RegistryAgent | null;
  agentLocked: boolean;
  onProviderChange?: (providerId: string) => void;
  setConfigOption: (id: string, value: string) => void;
  setAgentDefaultConfig: (id: string, value: string) => void;
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
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
}) {
  const t = useTranslations("Agent.components");
  const attachments = usePromptInputAttachments();
  const formRef = useRef<HTMLFormElement>(null);
  const hydratedRef = useRef(false);
  const agentOptions: PromptModel[] = installedAgents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    icon: (
      <AgentIcon
        registryId={agent.id}
        name={agent.name}
        size={14}
        isCustom={agent.install_method === "custom"}
        registryIcon={agent.icon}
      />
    ),
  }));
  const canSubmit = Boolean(
    expandAgentComposerText(localDraft) || attachments.files.length,
  ) && isConnected && !showStop;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (localDraft) composerRef.current?.setText(localDraft);
  }, [composerRef, localDraft]);

  return (
    <>
      <AttachmentFileInput />
      <AgentsPromptInput
        value={localDraft}
        onValueChange={setLocalDraft}
        disabled={!isConnected}
        loading={showStop}
        canSubmit={canSubmit}
        minRows={2}
        maxRows={8}
        formRef={formRef}
        placeholder={placeholder}
        editor={
          <PromptComposer
            ref={composerRef}
            submitOnEnter
            disabled={!isConnected}
            placeholder={placeholder}
            editorClassName="min-h-16 max-h-40 rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"
            placeholderClassName="left-0 top-0 text-sm leading-5 text-muted-foreground/55"
            onTextChange={setLocalDraft}
            onAtTrigger={onAtTrigger}
            onAtCancel={onAtCancel}
            onSlashTrigger={onSlashTrigger}
            onSlashCancel={onSlashCancel}
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
        models={toPromptModels(modelOption)}
        model={modelOption?.currentValue || ""}
        onModelChange={(value) => modelOption && setConfigOption(modelOption.id, value)}
        modelsLoading={isConnecting || isResumingHistory || catalogModelsLoading}
        onEmptyModelsOpen={onEmptyModelsOpen}
        modes={toPromptModels(isConnected ? modeOption : null)}
        mode={modeOption?.currentValue || ""}
        onModeChange={(value) => modeOption && setConfigOption(modeOption.id, value)}
        thinkingLevels={toPromptModels(isConnected ? thinkingOption : null)}
        thinking={thinkingOption?.currentValue || ""}
        onThinkingChange={(value) => thinkingOption && setConfigOption(thinkingOption.id, value)}
        labels={{
          chooseModel: t("composer.chooseModel"),
          chooseAgent: t("composer.selectAgent"),
          chooseMode: t("composer.chooseMode"),
          model: t("composer.model"),
          search: t("configOptionDropdown.searchPlaceholder"),
          searchModels: t("composer.searchModels"),
          searchAgents: t("composer.searchAgents"),
          back: t("composer.backToAgents"),
          noResults: t("configOptionDropdown.noResults"),
          loadingModels: t("composer.loadingModels"),
          thinkingFaster: t("composer.thinkingFaster"),
          thinkingSmarter: t("composer.thinkingSmarter"),
          thinkingEffort: t("composer.thinkingEffort"),
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
            {isConnected
              ? extraConfigOptions.map((opt) => (
                  <ConfigOptionDropdown
                    key={opt.id}
                    opt={opt}
                    icon={composerConfigIcon(opt.id)}
                    triggerClassName="rounded-2xl"
                    registryId={registryId}
                    activeAgent={activeAgent}
                    setConfigOption={setConfigOption}
                    setAgentDefaultConfig={setAgentDefaultConfig}
                    setInstalledAgents={setInstalledAgents}
                  />
                ))
              : null}
            {(loadingAgents || isConnecting || isResumingHistory) && !isConnected ? null : installedAgents.length === 0 ? (
              <span className="px-2 text-xs text-muted-foreground">{t("composer.noAgent")}</span>
            ) : null}
          </div>
        }
        header={<PromptInputAttachmentsSection />}
        onSubmit={async (text) => {
          const files = attachments.files;
          const previousDraft = localDraft;
          const composed = expandAgentComposerText(composerRef.current?.getText() ?? text);
          if (!composed && files.length === 0) {
            setLocalDraft(previousDraft);
            return;
          }
          setLocalDraft("");
          composerRef.current?.clear();
          persistedDraftRef.current = "";
          clearAgentChatDraft(
            sessionWorkspaceId,
            sessionProjectId,
            chatMode,
            instanceKey,
          );
          try {
            await onSubmit({ text: composed, files: await filesForSubmit(files) });
            attachments.clear();
          } catch (error) {
            setLocalDraft(previousDraft);
            composerRef.current?.setText(previousDraft);
            persistedDraftRef.current = previousDraft;
            throw error;
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
        className="w-full shadow-none"
      />
    </>
  );
}

export const AgentPromptComposer = React.memo(function AgentPromptComposer({
  currentPlan,
  isResumedSession,
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
  onEmptyModelsOpen,
  chatId = null,
  runtimeStatus = null,
  hasPersistenceHandle = false,
  installedAgents,
  configOptions,
  registryId,
  activeAgent,
  setConfigOption,
  setAgentDefaultConfig,
  setInstalledAgents,
  agentActivity,
  sendCancel,
  setWaitingForResponse,
  setMessages,
  stoppedRef,
  projectPath = null,
  availableCommands = [],
  workingDirectoryPicker = null,
}: {
  currentPlan: AgentPlan | null;
  isResumedSession: boolean;
  queuedPrompts: QueuedAgentPrompt[];
  onRemoveQueuedPrompt: (id: string) => void;
  onUpdateQueuedPrompt: (id: string, prompt: string) => void;
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
  onEmptyModelsOpen?: () => void;
  chatId?: string | null;
  runtimeStatus?: string | null;
  hasPersistenceHandle?: boolean;
  installedAgents: RegistryAgent[];
  configOptions: AgentConfigOption[];
  registryId: string;
  activeAgent: RegistryAgent | null;
  setConfigOption: (id: string, value: string) => void;
  setAgentDefaultConfig: (configId: string, value: string) => void;
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
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
  const showStop = Boolean(agentActivity.busy && !localDraft.trim());
  const modeOption = configOptionById(configOptions, "mode") ?? configOptionById(configOptions, "modes");
  const modelOption = configOptionById(configOptions, "model") ?? configOptionById(configOptions, "models");
  const thinkingOption =
    configOptionById(configOptions, "thinking") ?? configOptionById(configOptions, "think");
  const extraConfigOptions = configOptions.filter((option) => {
    const id = option.id.trim().toLowerCase();
    if (id === "mode" || id === "modes") return false;
    if (isComposerTrailingConfigOption(option)) return false;
    return option.type === "select" && option.options.length > 0;
  });
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
    onAtTrigger,
    onAtCancel,
    onSlashTrigger,
    onSlashCancel,
  } = useAgentComposerPopovers({
    availableCommands,
    projectPath,
    composerRef,
    activeProjectId: sessionProjectId,
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
    if (localDraft === persistedDraftRef.current) return;

    const timer = window.setTimeout(() => {
      setAgentChatDraft(
        sessionWorkspaceId,
        sessionProjectId,
        chatMode,
        localDraft,
        instanceKey,
      );
      persistedDraftRef.current = localDraft;
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    chatMode,
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
    >
      {(currentPlan || queuedPrompts.length > 0) && (
        <div className="mx-6 overflow-hidden rounded-t-3xl border border-border/70 border-b-0 bg-background/95">
          {currentPlan && (
            <div className={queuedPrompts.length > 0 ? "border-b border-border/70" : ""}>
              <PlanBlockView plan={currentPlan} embedded defaultOpen={!isResumedSession} />
            </div>
          )}
          {queuedPrompts.length > 0 && (
            <MessageQueueDock
              items={queuedPrompts}
              onRemove={onRemoveQueuedPrompt}
              onUpdatePrompt={onUpdateQueuedPrompt}
              onMove={onMoveQueuedPrompt}
            />
          )}
        </div>
      )}
      <PromptInputProvider>
        <ComposerPromptInput
          composerRef={composerRef}
          onAtTrigger={onAtTrigger}
          onAtCancel={onAtCancel}
          onSlashTrigger={onSlashTrigger}
          onSlashCancel={onSlashCancel}
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
          onEmptyModelsOpen={onEmptyModelsOpen}
          installedAgents={installedAgents}
          extraConfigOptions={extraConfigOptions}
          modeOption={modeOption}
          modelOption={modelOption}
          thinkingOption={thinkingOption}
          registryId={registryId}
          activeAgent={activeAgent}
          agentLocked={agentLocked}
          onProviderChange={onProviderChange}
          setConfigOption={setConfigOption}
          setAgentDefaultConfig={setAgentDefaultConfig}
          setInstalledAgents={setInstalledAgents}
          showStop={showStop}
          sendCancel={sendCancel}
          setWaitingForResponse={setWaitingForResponse}
          setMessages={setMessages}
          stoppedRef={stoppedRef}
          workingDirectoryPicker={workingDirectoryPicker}
          clearAgentChatDraft={clearAgentChatDraft}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      </PromptInputProvider>
      {popovers}
    </div>
  );
});
