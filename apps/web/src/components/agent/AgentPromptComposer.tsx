"use client";

import React, { useState, useEffect, useRef } from "react";
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
  usePromptInputAttachments,
} from "@workspace/ui";
import { Square } from "lucide-react";
import { useDialogStore, type QueuedAgentPrompt } from "@/hooks/use-dialog-store";
import type { AgentPlan, AgentUsage, AgentTurnUsage, AgentConfigOption } from "@/hooks/use-agent-session";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/types/agent-chat";
import { registerActiveAgentComposer } from "@/lib/agent/active-composer";
import type { ThreadEntry } from "@/lib/agent/thread";
import type { AgentActivity } from "./chat-helpers";
import { PlanBlockView } from "./PlanBlockView";
import { MessageQueueDock } from "./MessageQueueDock";
import { ConfigOptionDropdown } from "./ConfigOptionDropdown";

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
  canUseCurrentMode,
  wikiAskAvailability,
  isConnected,
  chatMode,
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
  setEntries,
  stoppedRef,
}: {
  currentPlan: AgentPlan | null;
  isResumedSession: boolean;
  queuedPrompts: QueuedAgentPrompt[];
  onRemoveQueuedPrompt: (id: string) => void;
  onUpdateQueuedPrompt: (id: string, prompt: string) => void;
  onMoveQueuedPrompt: (id: string, toIndex: number) => void;
  onSubmit: (message: { text: string; files?: import("ai").FileUIPart[] }) => Promise<void>;
  canUseCurrentMode: boolean;
  wikiAskAvailability: { enabled: boolean; reason: string | null };
  isConnected: boolean;
  chatMode: AgentChatMode;
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
  setEntries: React.Dispatch<React.SetStateAction<ThreadEntry[]>>;
  stoppedRef: React.MutableRefObject<boolean>;
}) {
  const setAgentChatDraft = useDialogStore((s) => s.setAgentChatDraft);
  const [localDraft, setLocalDraft] = useState(() =>
    useDialogStore.getState().getAgentChatDraft(
      sessionWorkspaceId,
      sessionProjectId,
      chatMode,
    ),
  );
  const persistedDraftRef = useRef(localDraft);

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
    );
  }, [chatMode, sessionProjectId, sessionWorkspaceId]);

  useEffect(() => {
    if (localDraft === persistedDraftRef.current) return;

    const timer = window.setTimeout(() => {
      setAgentChatDraft(
        sessionWorkspaceId,
        sessionProjectId,
        chatMode,
        localDraft
      );
      persistedDraftRef.current = localDraft;
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    chatMode,
    localDraft,
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
          await onSubmit({ text: msg.text, files: msg.files });
          setLocalDraft("");
          persistedDraftRef.current = "";
        }}
        className={`w-full border-0 shadow-none rounded-none ${(currentPlan || queuedPrompts.length > 0) ? "rounded-t-none" : "rounded-t-xl"}`}
        multiple
      >
        <PromptInputAttachmentsSection />
        <PromptInputBody>
          <PromptInputTextarea
            data-agent-chat-input="true"
            data-agent-chat-mode={chatMode}
            data-agent-chat-workspace-id={sessionWorkspaceId ?? undefined}
            data-agent-chat-project-id={sessionProjectId ?? undefined}
            placeholder={
              !canUseCurrentMode
                ? (wikiAskAvailability.reason ?? "Wiki Ask unavailable")
                : isConnected
                  ? (chatMode === "wiki_ask" ? "Ask about this wiki..." : "Type a message...")
                  : "Select agent to connect"
            }
            disabled={!isConnected || !canUseCurrentMode}
            value={localDraft}
            onChange={(e) => setLocalDraft(e.currentTarget.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputAddAttachmentsButton />
            {(loadingAgents || isConnecting || isResumingHistory) && !isConnected ? null : installedAgents.length === 0 ? (
              <span className="px-2 text-xs text-muted-foreground">No agent</span>
            ) : null}
          </PromptInputTools>
          <div className="flex items-center gap-2">
            {configOptions?.length > 0 && isConnected && (
              <div className="flex items-center gap-2">
                {configOptions
                  .filter(opt => opt.type === 'select' && opt.options.length > 0)
                  .map(opt => (
                    <ConfigOptionDropdown
                      key={opt.id}
                      opt={opt}
                      registryId={registryId}
                      activeAgent={activeAgent}
                      setConfigOption={setConfigOption}
                      setAgentDefaultConfig={setAgentDefaultConfig}
                      setInstalledAgents={setInstalledAgents}
                    />
                  ))}
              </div>
            )}
            <PromptInputSubmit
              status={agentActivity.busy ? "streaming" : undefined}
              onStop={
                agentActivity.busy
                  ? () => {
                    stoppedRef.current = true;
                    sendCancel();
                    setWaitingForResponse(false);
                    setEntries((prev) => {
                      const last = prev[prev.length - 1];
                      if (last?.role === "assistant") {
                        const updatedBlocks = last.blocks.map((block) =>
                          block.type === "tool_call" && block.status === "running"
                            ? { ...block, status: "completed" as const }
                            : block
                        );
                        return [
                          ...prev.slice(0, -1),
                          { ...last, isStreaming: false, blocks: updatedBlocks },
                        ];
                      }
                      return prev;
                    });
                  }
                  : undefined
              }
              disabled={!isConnected || !canUseCurrentMode}
              size={agentActivity.busy ? "sm" : "icon-sm"}
            >
              {agentActivity.busy ? (
                <span className="flex items-center gap-1.5">
                  <Square className="size-4 shrink-0" />
                </span>
              ) : undefined}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
});
