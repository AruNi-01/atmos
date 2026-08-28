"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  PromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  usePromptInputAttachments,
} from "@workspace/ui";
import { Bot, Brain, Square, X, Zap } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import { useDialogStore, type QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentPlan, AgentConfigOption } from "@/features/agent/hooks/use-agent-session";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/features/agent/types/index";
import { registerActiveAgentComposer } from "@/features/agent/lib/agent/active-composer";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { stopStreamingMessages } from "@/features/agent/lib/agent-chat-events";
import {
  composeAgentChatPrompt,
  parseLeadingAgentSlashCommand,
} from "@/features/agent/lib/agent-chat-slash-command";
import type { AgentActivity } from "../lib/chat-helpers";
import { PlanBlockView } from "./PlanBlockView";
import { MessageQueueDock } from "./MessageQueueDock";
import { ConfigOptionDropdown } from "./ConfigOptionDropdown";
import { useAgentComposerPopovers } from "../hooks/use-agent-composer-popovers";
import type { AgentChatSlashCommand } from "../hooks/use-agent-chat-session";
import { splitComposerConfigOptions } from "../lib/agent-chat-thread";

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

function SlashCommandChip({
  name,
  description,
  onRemove,
  removeLabel,
}: {
  name: string;
  description?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span
      data-agent-chat-slash-chip={name}
      title={description}
      className="mt-0.5 inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-1.5 py-px text-[12px] leading-[18px] font-medium text-foreground"
    >
      <Zap className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">/{name}</span>
      <button
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function PromptInputAttachmentsSection() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((a) => (
          <Attachment key={a.id} data={a} onRemove={() => attachments.remove(a.id)}>
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
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
  const [slashCommand, setSlashCommand] = useState<AgentChatSlashCommand | null>(null);
  const persistedDraftRef = useRef(localDraft);
  const slashHydratedRef = useRef(false);
  const composedDraft = composeAgentChatPrompt(slashCommand, localDraft);
  const showStop = Boolean(agentActivity.busy && !composedDraft);
  const { leading: leadingConfigOptions, trailing: trailingConfigOptions } =
    splitComposerConfigOptions(configOptions);
  const { handleComposerKeyDown, popovers, syncTriggers } = useAgentComposerPopovers({
    availableCommands,
    projectPath,
    setDraft: setLocalDraft,
    onSelectSlashCommand: setSlashCommand,
  });

  useEffect(() => {
    return registerActiveAgentComposer(
      sessionWorkspaceId,
      sessionProjectId,
      chatMode,
      {
        setDraft: (updater) => {
          setLocalDraft((previous) =>
            typeof updater === "function" ? updater(previous) : updater,
          );
        },
      },
      instanceKey,
    );
  }, [chatMode, instanceKey, sessionProjectId, sessionWorkspaceId]);

  useEffect(() => {
    if (slashHydratedRef.current || availableCommands.length === 0) return;
    slashHydratedRef.current = true;
    const parsed = parseLeadingAgentSlashCommand(localDraft, availableCommands);
    if (!parsed.command) return;
    setSlashCommand(parsed.command);
    setLocalDraft(parsed.rest);
    persistedDraftRef.current = composeAgentChatPrompt(parsed.command, parsed.rest);
  }, [availableCommands, localDraft]);

  useEffect(() => {
    if (composedDraft === persistedDraftRef.current) return;

    const timer = window.setTimeout(() => {
      setAgentChatDraft(
        sessionWorkspaceId,
        sessionProjectId,
        chatMode,
        composedDraft,
        instanceKey,
      );
      persistedDraftRef.current = composedDraft;
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    chatMode,
    composedDraft,
    instanceKey,
    sessionProjectId,
    sessionWorkspaceId,
    setAgentChatDraft,
  ]);

  return (
    <div className="shrink-0 px-3 pb-3 pt-px select-none">
      {(currentPlan || queuedPrompts.length > 0) && (
        <div className="mx-auto w-[96%] overflow-hidden rounded-t-2xl border border-border/70 border-b-0 bg-background/95">
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
      <PromptInput
        onSubmit={async (msg) => {
          const text = composeAgentChatPrompt(slashCommand, msg.text);
          const previousCommand = slashCommand;
          const previousDraft = localDraft;
          const previousComposed = composedDraft;
          if (!text && (msg.files?.length ?? 0) === 0) {
            setLocalDraft(previousDraft);
            return;
          }
          setSlashCommand(null);
          setLocalDraft("");
          persistedDraftRef.current = "";
          clearAgentChatDraft(
            sessionWorkspaceId,
            sessionProjectId,
            chatMode,
            instanceKey,
          );
          try {
            await onSubmit({ text, files: msg.files });
          } catch (error) {
            setSlashCommand(previousCommand);
            setLocalDraft(previousDraft);
            persistedDraftRef.current = previousComposed;
            throw error;
          }
        }}
        className={`w-full border-0 shadow-none rounded-none ${(currentPlan || queuedPrompts.length > 0) ? "rounded-t-none" : "rounded-t-xl"}`}
        multiple
      >
        <PromptInputAttachmentsSection />
        <PromptInputBody>
          <div
            className="flex w-full min-w-0 items-start gap-1.5 px-3 py-3"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              event.currentTarget.querySelector("textarea")?.focus();
            }}
          >
            {slashCommand ? (
              <SlashCommandChip
                name={slashCommand.name}
                description={slashCommand.description}
                onRemove={() => setSlashCommand(null)}
                removeLabel={t("composer.removeSlashCommand", {
                  name: `/${slashCommand.name}`,
                })}
              />
            ) : null}
            <PromptInputTextarea
              data-agent-chat-input="true"
              data-agent-chat-composer=""
              data-agent-chat-mode={chatMode}
              data-agent-chat-instance-key={instanceKey?.trim() || undefined}
              data-agent-chat-workspace-id={sessionWorkspaceId ?? undefined}
              data-agent-chat-project-id={sessionProjectId ?? undefined}
              className="min-h-16 min-w-0 flex-1 px-0 py-0"
              placeholder={
                !canUseCurrentMode
                  ? t("composer.placeholder.unavailable")
                  : slashCommand?.hint?.trim()
                    ? slashCommand.hint
                    : isConnected
                      ? t("composer.placeholder.connected")
                      : t("composer.placeholder.selectAgent")
              }
              disabled={!isConnected || !canUseCurrentMode}
              value={localDraft}
              onChange={(e) => {
                setLocalDraft(e.currentTarget.value);
                syncTriggers(e.currentTarget);
              }}
              onKeyUp={(e) => syncTriggers(e.currentTarget)}
              onClick={(e) => syncTriggers(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && e.currentTarget.value === "" && slashCommand) {
                  e.preventDefault();
                  setSlashCommand(null);
                  return;
                }
                handleComposerKeyDown(e);
              }}
            />
          </div>
        </PromptInputBody>
        <PromptInputFooter className="gap-2">
          <PromptInputTools className="gap-2">
            <PromptInputAddAttachmentsButton />
            {isConnected
              ? leadingConfigOptions.map((opt) => (
                  <ConfigOptionDropdown
                    key={opt.id}
                    opt={opt}
                    icon={composerConfigIcon(opt.id)}
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
          </PromptInputTools>
          <div className="flex min-w-0 items-center gap-2">
            {installedAgents.length > 0 ? (
              agentLocked || !onProviderChange ? (
                <span className="inline-flex h-8 max-w-[9rem] items-center gap-1.5 px-2 text-xs text-foreground">
                  <AgentIcon
                    registryId={activeAgent?.id || registryId}
                    name={activeAgent?.name || registryId}
                    size={14}
                    isCustom={activeAgent?.install_method === "custom"}
                    registryIcon={activeAgent?.icon}
                  />
                  <span className="truncate">{activeAgent?.name || t("composer.selectAgent")}</span>
                </span>
              ) : (
                <Select
                  value={registryId || installedAgents[0]?.id || ""}
                  onValueChange={onProviderChange}
                >
                  <SelectTrigger className="h-8 w-auto min-w-0 gap-1.5 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-muted/60">
                    <SelectValue placeholder={t("composer.selectAgent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {installedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-1.5">
                          <AgentIcon
                            registryId={agent.id}
                            name={agent.name}
                            size={14}
                            isCustom={agent.install_method === "custom"}
                            registryIcon={agent.icon}
                          />
                          <span className="truncate">{agent.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : null}
            {isConnected
              ? trailingConfigOptions.map((opt) => (
                  <ConfigOptionDropdown
                    key={opt.id}
                    opt={opt}
                    icon={composerConfigIcon(opt.id)}
                    registryId={registryId}
                    activeAgent={activeAgent}
                    setConfigOption={setConfigOption}
                    setAgentDefaultConfig={setAgentDefaultConfig}
                    setInstalledAgents={setInstalledAgents}
                  />
                ))
              : null}
            <PromptInputSubmit
              status={showStop ? "streaming" : undefined}
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
              disabled={!isConnected || !canUseCurrentMode}
              size="icon-sm"
            >
              {showStop ? (
                <span className="flex items-center gap-1.5">
                  <Square className="size-4 shrink-0" />
                </span>
              ) : undefined}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
      {popovers}
    </div>
  );
});
