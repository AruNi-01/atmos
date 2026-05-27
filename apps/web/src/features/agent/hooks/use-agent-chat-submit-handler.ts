"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { FileUIPart } from "ai";
import { agentApi as agentRestApi } from "@/api/rest-api";
import {
  buildQueuedAgentPromptContent,
  type QueuedAgentPrompt,
} from "@/app-shell/state/use-dialog-store";
import type { AgentChatMode } from "@/features/agent/types/index";

type SubmitMessage = {
  text: string;
  files?: FileUIPart[];
};

interface UseAgentChatSubmitHandlerOptions {
  canUseCurrentMode: boolean;
  chatMode: AgentChatMode;
  clearAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
  ) => void;
  enqueueAgentChatPrompt: (data: Omit<QueuedAgentPrompt, "id" | "createdAt">) => string;
  entriesLength: number;
  isConnected: boolean;
  localPath: string | null;
  queuedPromptCount: number;
  sessionCwd: string | null;
  sessionProjectId: string | null;
  sessionWorkspaceId: string | null;
  stoppedRef: MutableRefObject<boolean>;
  setIsAutoGeneratingTitle: Dispatch<SetStateAction<boolean>>;
  setSessionTitle: Dispatch<SetStateAction<string | null>>;
  setSessionTitleSource: Dispatch<SetStateAction<string | null>>;
  setShouldScrambleAutoTitle: Dispatch<SetStateAction<boolean>>;
}

export function useAgentChatSubmitHandler({
  canUseCurrentMode,
  chatMode,
  clearAgentChatDraft,
  enqueueAgentChatPrompt,
  entriesLength,
  isConnected,
  localPath,
  queuedPromptCount,
  sessionCwd,
  sessionProjectId,
  sessionWorkspaceId,
  stoppedRef,
  setIsAutoGeneratingTitle,
  setSessionTitle,
  setSessionTitleSource,
  setShouldScrambleAutoTitle,
}: UseAgentChatSubmitHandlerOptions) {
  return useCallback(
    async (message: SubmitMessage) => {
      const text = message.text.trim();
      if (!text || !isConnected || !canUseCurrentMode) return;
      stoppedRef.current = false;
      const displayFiles = message.files?.map((f, i) => ({ ...f, id: `f-${Date.now()}-${i}` }));
      if (entriesLength === 0 && queuedPromptCount === 0) {
        setSessionTitle(null);
        setSessionTitleSource(null);
        setIsAutoGeneratingTitle(false);
        setShouldScrambleAutoTitle(false);
      }
      let finalPrompt = text;
      let attachmentPaths: string[] | undefined;

      const uploadPath = localPath ?? sessionCwd;
      if (message.files && message.files.length > 0 && uploadPath) {
        try {
          const { paths } = await agentRestApi.uploadAttachments(
            uploadPath,
            message.files.map((f) => ({
              url: f.url,
              filename: f.filename,
              mediaType: f.mediaType,
            }))
          );
          attachmentPaths = paths.length > 0 ? paths : undefined;
          finalPrompt = buildQueuedAgentPromptContent(text, attachmentPaths);
        } catch (err) {
          console.error("Failed to upload attachments:", err);
        }
      }

      enqueueAgentChatPrompt({
        prompt: finalPrompt,
        displayPrompt: text,
        attachmentPaths,
        files: displayFiles,
        workspaceId: sessionWorkspaceId,
        projectId: sessionProjectId,
        mode: chatMode,
        origin: "panel",
      });
      clearAgentChatDraft(sessionWorkspaceId, sessionProjectId, chatMode);
    },
    [
      canUseCurrentMode,
      chatMode,
      clearAgentChatDraft,
      enqueueAgentChatPrompt,
      entriesLength,
      isConnected,
      localPath,
      queuedPromptCount,
      sessionCwd,
      sessionProjectId,
      sessionWorkspaceId,
      stoppedRef,
      setIsAutoGeneratingTitle,
      setSessionTitle,
      setSessionTitleSource,
      setShouldScrambleAutoTitle,
    ]
  );
}
