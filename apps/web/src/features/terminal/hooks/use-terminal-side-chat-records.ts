"use client";

import React from "react";

import { terminalSideChatApi, type TerminalSideChatRecord } from "@/api/ws-api";
import type { TerminalRef } from "@/features/terminal/components/Terminal";
import {
  getAvailableSideChatRecords,
  getFirstOpenSideChatRecord,
  isSideChatClosing,
  isSideChatOpen,
  mergeSideChatRecords,
  normalizeSideChatStatus,
  parseAgentRef,
  sideChatRecordMatchesSource,
  toSideChatDto,
  type LocalSideChatRecord,
  type SourceSurfaceKind,
} from "@/features/terminal/lib/terminal-side-chat";

interface UseTerminalSideChatRecordsOptions {
  sourceSurfaceKind: SourceSurfaceKind;
  sourceSurfaceRefJson: string | null;
  sourceTmuxWindowName?: string | null;
  terminalRefs: React.MutableRefObject<Map<string, TerminalRef>>;
  workspaceId: string;
}

export function useTerminalSideChatRecords({
  sourceSurfaceKind,
  sourceSurfaceRefJson,
  sourceTmuxWindowName,
  terminalRefs,
  workspaceId,
}: UseTerminalSideChatRecordsOptions) {
  const openedSideChatParamRef = React.useRef<string | null>(null);
  const [records, setRecords] = React.useState<LocalSideChatRecord[]>([]);
  const [activeSideChatId, setActiveSideChatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workspaceId || !sourceTmuxWindowName) return;
    let cancelled = false;
    void terminalSideChatApi
      .list(workspaceId)
      .then((response) => {
        if (cancelled) return;
        const sourceRecords = response.records
          .filter(
            (record) =>
              record.source_surface_kind === sourceSurfaceKind &&
              sideChatRecordMatchesSource(record, sourceSurfaceRefJson, sourceTmuxWindowName) &&
              !isSideChatClosing(record.status),
          )
          .map<LocalSideChatRecord>((record) => ({
            ...record,
            status: normalizeSideChatStatus(record.status),
            agent: parseAgentRef(record.agent_ref_json),
            isNew: false,
            sessionId: crypto.randomUUID(),
          }));
        setRecords((current) => mergeSideChatRecords(current, sourceRecords));
      })
      .catch((error) => {
        console.error("Failed to load terminal side chats:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceSurfaceKind, sourceSurfaceRefJson, sourceTmuxWindowName, workspaceId]);

  const persistRecord = React.useCallback(async (record: LocalSideChatRecord) => {
    return terminalSideChatApi.upsert(toSideChatDto(record));
  }, []);

  const updateLocalRecord = React.useCallback((sideChatId: string, patch: Partial<LocalSideChatRecord>) => {
    setRecords((current) =>
      current.map((record) =>
        record.side_chat_id === sideChatId ? { ...record, ...patch } : record,
      ),
    );
  }, []);

  const applyPersistedRecords = React.useCallback((updatedRecords: TerminalSideChatRecord[]) => {
    if (updatedRecords.length === 0) return;
    const updatedById = new Map(updatedRecords.map((record) => [record.side_chat_id, record]));
    setRecords((current) =>
      current.map((record) => {
        const updatedRecord = updatedById.get(record.side_chat_id);
        if (!updatedRecord) return record;
        return {
          ...record,
          ...updatedRecord,
          status: normalizeSideChatStatus(updatedRecord.status),
          sessionId: crypto.randomUUID(),
          isNew: false,
        };
      }),
    );
  }, []);

  const addRecord = React.useCallback((record: LocalSideChatRecord) => {
    setActiveSideChatId(record.side_chat_id);
    setRecords((current) => [...current, record]);
  }, []);

  const hideSideChat = React.useCallback(
    async () => {
      const openRecords = records.filter((record) => isSideChatOpen(record.status));
      if (openRecords.length === 0) return;
      const results = await Promise.allSettled(
        openRecords.map((record) =>
          terminalSideChatApi.setStatus({
            workspace_id: workspaceId,
            side_chat_id: record.side_chat_id,
            status: "hidden",
          }),
        ),
      );
      applyPersistedRecords(
        results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
      );
      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Failed to hide terminal side chat:", result.reason);
        }
      });
    },
    [applyPersistedRecords, records, workspaceId],
  );

  const showSideChat = React.useCallback(
    async (sideChatId: string) => {
      try {
        const updatedRecord = await terminalSideChatApi.setStatus({
          workspace_id: workspaceId,
          side_chat_id: sideChatId,
          status: "open",
        });
        setActiveSideChatId(sideChatId);
        applyPersistedRecords([updatedRecord]);
      } catch (error) {
        console.error("Failed to show terminal side chat:", error);
      }
    },
    [applyPersistedRecords, workspaceId],
  );

  const closeSideChat = React.useCallback(
    async (sideChatId: string) => {
      try {
        await terminalSideChatApi.close({
          workspace_id: workspaceId,
          side_chat_id: sideChatId,
        });
        terminalRefs.current.get(sideChatId)?.destroy();
        terminalRefs.current.delete(sideChatId);
        setActiveSideChatId((current) => (current === sideChatId ? null : current));
        setRecords((current) => current.filter((record) => record.side_chat_id !== sideChatId));
      } catch (error) {
        console.error("Failed to close terminal side chat:", error);
      }
    },
    [terminalRefs, workspaceId],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sideChatId = new URLSearchParams(window.location.search).get("sideChat");
    if (!sideChatId || openedSideChatParamRef.current === sideChatId) return;
    const record = records.find((item) => item.side_chat_id === sideChatId);
    if (!record) return;
    openedSideChatParamRef.current = sideChatId;
    if (!isSideChatOpen(record.status)) {
      void showSideChat(sideChatId);
    }
  }, [records, showSideChat]);

  React.useEffect(() => {
    const availableRecords = getAvailableSideChatRecords(records);
    if (availableRecords.length === 0) {
      if (activeSideChatId !== null) setActiveSideChatId(null);
      return;
    }
    if (!activeSideChatId || !availableRecords.some((record) => record.side_chat_id === activeSideChatId)) {
      const fallback = getFirstOpenSideChatRecord(availableRecords) ?? availableRecords[0];
      setActiveSideChatId(fallback.side_chat_id);
    }
  }, [activeSideChatId, records]);

  return {
    activeSideChatId,
    addRecord,
    closeSideChat,
    hideSideChat,
    persistRecord,
    records,
    setActiveSideChatId,
    showSideChat,
    updateLocalRecord,
  };
}
