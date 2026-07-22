"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";

import { fsApi, terminalSideChatApi, type TerminalSideContextCaptureResponse } from "@/api/ws-api";
import {
  buildInteractiveAgentRunPlan,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import { toPendingTerminalRun, deliverPendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";
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
  type TerminalForkKind,
} from "@/features/terminal/lib/terminal-side-chat";
import type { TerminalPromptContext } from "@/features/terminal/lib/terminal-ai-context-protocol";
import type { TerminalPaneAgent } from "@/features/terminal/types";
import { useTerminalSideChatRecords } from "./use-terminal-side-chat-records";

export interface UseTerminalSideChatsOptions {
  workspaceId: string;
  projectId?: string | null;
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
  /**
   * Spawns a brand-new terminal panel (not a side-chat modal) that runs the
   * built launch command. Supplied by the terminal grid. When omitted, the
   * `/spawn` command is unavailable for this surface.
   */
  onSpawnTerminal?: (request: SpawnTerminalRequest) => void;
}

export interface SpawnTerminalRequest {
  agent: TerminalPaneAgent;
  /** Display title for the spawned pane, already suffixed with " · By Spawn". */
  title: string;
  launchCommand: string;
  agentId: string;
  tuiFollowUpPrompt?: string;
}

/** Fixed number of user-prompt characters kept in a spawned pane title. */
const SPAWN_TITLE_PROMPT_MAX_CHARS = 24;
const SPAWN_TITLE_SUFFIX = " · By Spawn";

function buildSpawnTerminalTitle(userPrompt: string): string {
  const normalized = userPrompt.trim().replace(/\s+/g, " ");
  const head = normalized.slice(0, SPAWN_TITLE_PROMPT_MAX_CHARS).trim();
  return `${head || "Spawn"}${SPAWN_TITLE_SUFFIX}`;
}

export function useTerminalSideChats({
  workspaceId,
  projectId,
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
  onSpawnTerminal,
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
      contexts: TerminalPromptContext[] = [],
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
        const selectedContexts = contexts.filter(
          (context): context is TerminalPromptContext & { kind: "terminal_selection" } =>
            context.kind === "terminal_selection",
        );
        const directSidePrompt = buildSideChatPrompt({
          capture,
          selectedContexts,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
        });
        const sidePrompt = await resolveSideChatPrompt({
          capture,
          directSidePrompt,
          rootPath: localPath?.trim() || projectRootPath?.trim() || null,
          selectedContexts,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
          workspaceId,
        });
        const plan = buildInteractiveAgentRunPlan({
          agentId: agent.id,
          launchCommand: agent.command,
          prompt: sidePrompt,
          runConfig,
        });
        const pendingInitialRun = toPendingTerminalRun(plan.launchCommand, {
          agentId: agent.id,
          tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
        });
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
          pendingInitialRun,
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

  const startSpawn = React.useCallback(
    async (
      userPrompt: string,
      agent: TerminalPaneAgent,
      runConfig?: TerminalAgentRunConfigInput | null,
      contexts: TerminalPromptContext[] = [],
    ) => {
      if (!onSpawnTerminal) return;
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
        const selectedContexts = contexts.filter(
          (context): context is TerminalPromptContext & { kind: "terminal_selection" } =>
            context.kind === "terminal_selection",
        );
        const directPrompt = buildSideChatPrompt({
          capture,
          selectedContexts,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
          kind: "spawn",
        });
        const spawnPrompt = await resolveSideChatPrompt({
          capture,
          directSidePrompt: directPrompt,
          rootPath: localPath?.trim() || projectRootPath?.trim() || null,
          selectedContexts,
          sourceTmuxWindowName: resolvedSourceTmuxWindowName,
          userPrompt,
          workspaceId,
          kind: "spawn",
        });
        const plan = buildInteractiveAgentRunPlan({
          agentId: agent.id,
          launchCommand: agent.command,
          prompt: spawnPrompt,
          runConfig,
        });
        onSpawnTerminal({
          agent,
          title: buildSpawnTerminalTitle(userPrompt),
          launchCommand: plan.launchCommand,
          agentId: agent.id,
          tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
        });
      } catch (error) {
        console.error("Failed to spawn terminal panel:", error);
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
      localPath,
      onSpawnTerminal,
      projectName,
      projectRootPath,
      sideContextPromptBudgetBytes,
      sourceSessionId,
      sourceTmuxWindowName,
      t,
      workspaceId,
      workspaceName,
    ],
  );

  const sideChatLayer = (
    <TerminalSideChatLayer
      localPath={localPath}
      projectId={projectId}
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
        if (record.pendingInitialRun && !record.hasSentInitialCommand) {
          const terminalRef = terminalRefs.current.get(record.side_chat_id);
          if (terminalRef) {
            deliverPendingTerminalRun(terminalRef, record.pendingInitialRun);
          }
          updateLocalRecord(record.side_chat_id, {
            hasSentInitialCommand: true,
            pendingInitialRun: undefined,
            isNew: false,
          });
        } else if (record.isNew) {
          updateLocalRecord(record.side_chat_id, { isNew: false });
        }
        void persistRecord({
          ...record,
          hasSentInitialCommand: true,
          pendingInitialRun: undefined,
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
    startSpawn,
  };
}

async function resolveSideChatPrompt({
  capture,
  directSidePrompt,
  rootPath,
  selectedContexts,
  sourceTmuxWindowName,
  userPrompt,
  workspaceId,
  kind = "side",
}: {
  capture: TerminalSideContextCaptureResponse;
  directSidePrompt: string;
  rootPath: string | null;
  selectedContexts: Array<TerminalPromptContext & { kind: "terminal_selection" }>;
  sourceTmuxWindowName: string;
  userPrompt: string;
  workspaceId: string;
  kind?: TerminalForkKind;
}): Promise<string> {
  if (shouldInlineSideChatPrompt(directSidePrompt) || !rootPath) {
    return directSidePrompt;
  }

  const contextFilePath = buildSideChatContextFilePath({
    rootPath,
    workspaceId,
    timestampMs: Date.now(),
    kind,
  });

  try {
    await fsApi.writeFile(
      contextFilePath,
      buildSideChatContextFileContent({
        capture,
        selectedContexts,
        sourceTmuxWindowName,
        kind,
      }),
    );
    return buildSideChatPromptWithContextFile({
      capture,
      contextFilePath,
      selectedContexts,
      sourceTmuxWindowName,
      userPrompt,
      kind,
    });
  } catch (error) {
    console.warn("Failed to write terminal context file; falling back to inline prompt", error);
    return directSidePrompt;
  }
}
