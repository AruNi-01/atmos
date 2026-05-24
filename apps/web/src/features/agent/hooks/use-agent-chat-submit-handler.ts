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
  wikiPath: string | null;
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
  wikiPath,
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
      let sessionTitleForPrompt: string | undefined;
      if (entriesLength === 0 && queuedPromptCount === 0) {
        if (chatMode === "wiki_ask") {
          const projName = (wikiPath ?? localPath)?.split("/").pop() ?? "Project";
          const now = new Date();
          const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          sessionTitleForPrompt = `${projName}_WikiAsk_${ts}`;
          setSessionTitle(sessionTitleForPrompt);
          setSessionTitleSource("user");
          setIsAutoGeneratingTitle(false);
          setShouldScrambleAutoTitle(false);
        } else {
          setSessionTitle(null);
          setSessionTitleSource("auto");
          setIsAutoGeneratingTitle(true);
          setShouldScrambleAutoTitle(false);
        }
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
        sessionTitle: sessionTitleForPrompt,
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
      wikiPath,
      setIsAutoGeneratingTitle,
      setSessionTitle,
      setSessionTitleSource,
      setShouldScrambleAutoTitle,
    ]
  );
}
