"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";

import { fsApi, terminalSideChatApi, type TerminalSideContextCaptureResponse } from "@/api/ws-api";
import {
  buildInteractiveAgentCommand,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import { useTerminalSideChatSettingsStore } from "@/features/settings/store/terminal-side-chat-settings-store";
import { TerminalSideChatDots } from "@/features/terminal/components/TerminalSideChatDots";
import { TerminalSideChatLayer } from "@/features/terminal/components/TerminalSideChatLayer";
import type { TerminalRef } from "@/features/terminal/components/Terminal";
import {
  buildSideChatContextFileContent,
  buildSideChatContextFilePath,
  buildSideChatPrompt,
  buildSideChatPromptWithContextFile,
  isSideChatOpen,
  pickUniqueBrightColor,
  shouldInlineSideChatPrompt,
  type LocalSideChatRecord,
  type SourceSurfaceKind,
} from "@/features/terminal/lib/terminal-side-chat";
import type { TerminalPaneAgent } from "@/features/terminal/types";
import { useTerminalSideChatRecords } from "./use-terminal-side-chat-records";

export interface UseTerminalSideChatsOptions {
  workspaceId: string;
  projectName?: string | null;
  workspaceName?: string | null;
  localPath?: string | null;
  onInteraction?: (event: Event | React.SyntheticEvent) => void;
  projectRootPath?: string | null;
  sourcePaneId: string;
  sourceSessionId?: string | null;
  sourceSurfaceKind: SourceSurfaceKind;
  sourceSurfaceRef?: unknown;
  sourceTmuxWindowName?: string | null;
  terminalScale?: number;
}

export function useTerminalSideChats({
  workspaceId,
  projectName,
  workspaceName,
  localPath,
  onInteraction,
  projectRootPath,
  sourcePaneId,
  sourceSessionId,
  sourceSurfaceKind,
  sourceSurfaceRef,
  sourceTmuxWindowName,
  terminalScale,
}: UseTerminalSideChatsOptions) {
  const t = useTranslations("terminal.sideChat");
  const terminalRefs = React.useRef<Map<string, TerminalRef>>(new Map());
  const sideChatFlyTargetRef = React.useRef<HTMLDivElement | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const {
    sideContextPromptBudgetBytes,
    loadSettings: loadTerminalSideChatSettings,
  } = useTerminalSideChatSettingsStore();

  React.useEffect(() => {
    void loadTerminalSideChatSettings();
  }, [loadTerminalSideChatSettings]);

  const sourceSurfaceRefJson = React.useMemo(() => {
    if (sourceSurfaceRef == null) return null;
    try {
      return JSON.stringify(sourceSurfaceRef);
    } catch {
      return null;
    }
  }, [sourceSurfaceRef]);

  const {
    activeSideChatId,
    addRecord,
    closeSideChat,
    hideSideChat,
    persistRecord,
    records,
    setActiveSideChatId,
    showSideChat,
    updateLocalRecord,
  } = useTerminalSideChatRecords({
    sourceSurfaceKind,
    sourceSurfaceRefJson,
    sourceTmuxWindowName,
    terminalRefs,
    workspaceId,
  });

  const startSideChat = React.useCallback(
    async (
      userPrompt: string,
      agent: TerminalPaneAgent,
      runConfig?: TerminalAgentRunConfigInput | null,
    ) => {
      if (!sourceTmuxWindowName) {
        toastManager.add({
          title: t("errorTitle"),
          description: t("sourceNotReady"),
          type: "error",
        });
        return;
      }
      setIsStarting(true);
      try {
        const capture = await terminalSideChatApi.captureContext({
          workspace_id: workspaceId,
          project_name: projectName,
          workspace_name: workspaceName,
          source_session_id: sourceSessionId,
          source_tmux_window_name: sourceTmuxWindowName,
          max_prompt_bytes: sideContextPromptBudgetBytes,
        });
        const resolvedSourceTmuxWindowName = capture.tmux_window_name || sourceTmuxWindowName;
        const sideChatId = `side-${crypto.randomUUID()}`;
        const sideTmuxWindowName = `side-${sideChatId.slice(5, 13)}`;
        const colorHex = pickUniqueBrightColor(records.map((record) => record.color_hex));
        const directSidePrompt = buildSideChatPrompt({
          capture,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
        });
        const sidePrompt = await resolveSideChatPrompt({
          capture,
          directSidePrompt,
          rootPath: localPath?.trim() || projectRootPath?.trim() || null,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
          workspaceId,
        });
        const initialCommand = `${buildInteractiveAgentCommand({
          agentId: agent.id,
          launchCommand: agent.command,
          prompt: sidePrompt,
          runConfig,
        })}\r`;
        const record: LocalSideChatRecord = {
          side_chat_id: sideChatId,
          workspace_id: workspaceId,
          project_name: projectName ?? null,
          workspace_name: workspaceName ?? null,
          source_pane_id: sourcePaneId,
          source_tmux_window_name: resolvedSourceTmuxWindowName,
          source_surface_kind: sourceSurfaceKind,
          source_surface_ref_json: sourceSurfaceRefJson,
          side_tmux_window_name: sideTmuxWindowName,
          agent_ref_json: JSON.stringify({
            id: agent.id,
            label: agent.label,
            command: agent.command,
            iconType: agent.iconType,
            pipeCommand: agent.pipeCommand,
          }),
          color_hex: colorHex,
          status: "open",
          agent,
          hasSentInitialCommand: false,
          initialCommand,
          isNew: true,
          sessionId: crypto.randomUUID(),
        };
        addRecord(record);
      } catch (error) {
        console.error("Failed to start terminal side chat:", error);
        toastManager.add({
          title: t("errorTitle"),
          description: t("startFailed"),
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [
      addRecord,
      localPath,
      projectName,
      projectRootPath,
      records,
      sideContextPromptBudgetBytes,
      sourcePaneId,
      sourceSessionId,
      sourceSurfaceKind,
      sourceSurfaceRefJson,
      sourceTmuxWindowName,
      t,
      workspaceId,
      workspaceName,
    ],
  );

  const sideChatLayer = (
    <TerminalSideChatLayer
      localPath={localPath}
      projectName={projectName}
      projectRootPath={projectRootPath}
      records={records}
      activeSideChatId={activeSideChatId}
      sourcePaneId={sourcePaneId}
      sourceTmuxWindowName={sourceTmuxWindowName ?? ""}
      sideChatFlyTargetRef={sideChatFlyTargetRef}
      terminalRefs={terminalRefs}
      terminalScale={terminalScale}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      onClose={closeSideChat}
      onCloseAll={(sideChatIds) => {
        void Promise.all(sideChatIds.map((sideChatId) => closeSideChat(sideChatId)));
      }}
      onHide={hideSideChat}
      onInteraction={onInteraction}
      onSelectSideChat={(sideChatId) => {
        const record = records.find((item) => item.side_chat_id === sideChatId);
        if (!record) return;
        if (isSideChatOpen(record.status)) {
          setActiveSideChatId(sideChatId);
          return;
        }
        void showSideChat(sideChatId);
      }}
      onReady={(record) => {
        if (record.initialCommand && !record.hasSentInitialCommand) {
          terminalRefs.current.get(record.side_chat_id)?.sendText(record.initialCommand);
          updateLocalRecord(record.side_chat_id, {
            hasSentInitialCommand: true,
            initialCommand: undefined,
            isNew: false,
          });
        } else if (record.isNew) {
          updateLocalRecord(record.side_chat_id, { isNew: false });
        }
        void persistRecord({
          ...record,
          hasSentInitialCommand: true,
          initialCommand: undefined,
          isNew: false,
          status: "open",
        });
      }}
    />
  );

  const sideChatDots = (
    <TerminalSideChatDots
      records={records}
      activeSideChatId={activeSideChatId}
      isStarting={isStarting}
      onShow={showSideChat}
    />
  );

  return {
    getSideChatFlyTargetClientPoint: () => {
      const rect = sideChatFlyTargetRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(24, rect.height / 2),
      };
    },
    sideChatDots,
    sideChatLayer,
    startSideChat,
  };
}

async function resolveSideChatPrompt({
  capture,
  directSidePrompt,
  rootPath,
  sourceTmuxWindowName,
  userPrompt,
  workspaceId,
}: {
  capture: TerminalSideContextCaptureResponse;
  directSidePrompt: string;
  rootPath: string | null;
  sourceTmuxWindowName: string;
  userPrompt: string;
  workspaceId: string;
}): Promise<string> {
  if (shouldInlineSideChatPrompt(directSidePrompt) || !rootPath) {
    return directSidePrompt;
  }

  const contextFilePath = buildSideChatContextFilePath({
    rootPath,
    workspaceId,
    timestampMs: Date.now(),
  });

  try {
    await fsApi.writeFile(
      contextFilePath,
      buildSideChatContextFileContent({
        capture,
        sourceTmuxWindowName,
      }),
    );
    return buildSideChatPromptWithContextFile({
      capture,
      contextFilePath,
      sourceTmuxWindowName,
      userPrompt,
    });
  } catch (error) {
    console.warn("Failed to write terminal side chat context file; falling back to inline prompt", error);
    return directSidePrompt;
  }
}
