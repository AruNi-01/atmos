"use client";

import React from "react";

import {
  getAvailableSideChatRecords,
  getFirstOpenSideChatRecord,
  hasOpenSideChatRecord,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";
import { TerminalSideChatModal } from "./TerminalSideChatModal";
import type { TerminalRef } from "./Terminal";

interface TerminalSideChatLayerProps {
  activeSideChatId: string | null;
  localPath?: string | null;
  onClose: (sideChatId: string) => void;
  onCloseAll: (sideChatIds: string[]) => void;
  onHide: () => void;
  onInteraction?: (event: Event | React.SyntheticEvent) => void;
  onReady: (record: LocalSideChatRecord) => void;
  onSelectSideChat: (sideChatId: string) => void;
  projectName?: string | null;
  projectRootPath?: string | null;
  records: LocalSideChatRecord[];
  sourcePaneId: string;
  sourceTmuxWindowName: string;
  terminalRefs: React.MutableRefObject<Map<string, TerminalRef>>;
  terminalScale?: number;
  workspaceId: string;
  workspaceName?: string | null;
}

export function TerminalSideChatLayer({
  localPath,
  projectName,
  projectRootPath,
  records,
  activeSideChatId,
  sourcePaneId,
  sourceTmuxWindowName,
  terminalRefs,
  terminalScale,
  workspaceId,
  workspaceName,
  onClose,
  onCloseAll,
  onHide,
  onInteraction,
  onSelectSideChat,
  onReady,
}: TerminalSideChatLayerProps) {
  const availableRecords = getAvailableSideChatRecords(records);
  const activeRecord =
    availableRecords.find((record) => record.side_chat_id === activeSideChatId) ??
    getFirstOpenSideChatRecord(availableRecords) ??
    availableRecords[0] ??
    null;
  const hasOpenRecord = hasOpenSideChatRecord(availableRecords);

  if (!activeRecord || !hasOpenRecord) return null;

  return (
    <TerminalSideChatModal
      activeSideChatId={activeRecord.side_chat_id}
      localPath={localPath}
      projectName={projectName}
      projectRootPath={projectRootPath}
      records={availableRecords}
      sourcePaneId={sourcePaneId}
      sourceTmuxWindowName={sourceTmuxWindowName}
      terminalRefs={terminalRefs}
      terminalScale={terminalScale}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      onClose={onClose}
      onCloseAll={onCloseAll}
      onHide={onHide}
      onInteraction={onInteraction}
      onReady={onReady}
      onSelectSideChat={onSelectSideChat}
    />
  );
}
