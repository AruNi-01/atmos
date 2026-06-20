import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import { TerminalWebView, type TerminalWebViewHandle } from "@/features/terminal/TerminalWebView";
import { createTerminalOutputBatcher } from "@/features/terminal/terminal-output-batcher";
import { resolveActiveTerminalEntry } from "@/features/terminal/terminal-selection";
import {
  getTerminalPasteInput,
  getTerminalShortcutInput,
  type TerminalShortcut,
} from "@/features/terminal/terminal-shortcuts";
import { wsActions } from "@/api/ws-actions";
import { TerminalWsClient, type TerminalWsState } from "@/api/terminal-ws-client";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore, type MobileTerminalEntry } from "@/stores/terminal-store";
import { colors } from "@/theme/colors";

type TerminalConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

const EMPTY_TERMINAL_ENTRIES: MobileTerminalEntry[] = [];

export type TerminalHeaderControls = {
  activeEntryId: string | null;
  entries: Array<{ id: string; label: string }>;
  onCreateEntry: () => void;
  onSelectEntry: (entryId: string) => void;
};

export function TerminalScreen({
  onHeaderControlsChange,
  projectName,
  workspaceId,
  workspaceName,
}: {
  onHeaderControlsChange?: (controls: TerminalHeaderControls | null) => void;
  projectName?: string | null;
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const { client: appWsClient, state: appWsState } = useMobileWs();
  const entries = useTerminalStore((state) => state.entriesByWorkspaceId[workspaceId] ?? EMPTY_TERMINAL_ENTRIES);
  const activeEntryId = useTerminalStore((state) => state.activeEntryIdByWorkspaceId[workspaceId]);
  const setEntries = useTerminalStore((state) => state.setEntries);
  const setActiveEntry = useTerminalStore((state) => state.setActiveEntry);
  const addEntry = useTerminalStore((state) => state.addEntry);
  const updateEntry = useTerminalStore((state) => state.updateEntry);
  const terminalWsUrl = useSessionStore((state) => state.activeClientSession?.terminal_ws_url);
  const webViewRef = useRef<TerminalWebViewHandle>(null);
  const terminalClientRef = useRef<TerminalWsClient | null>(null);
  const terminalSizeRef = useRef({ cols: 80, rows: 24 });
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>("disconnected");
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const candidates = useQuery({
    queryKey: ["terminal-candidates", workspaceId, projectName, workspaceName, appWsState],
    enabled: Boolean(appWsClient && appWsState === "open"),
    queryFn: () =>
      wsActions.terminalWorkspaceCandidates(appWsClient!, {
        workspace_id: workspaceId,
        project_name: projectName ?? null,
        workspace_name: workspaceName,
      }),
  });

  useEffect(() => {
    const serverEntries =
      candidates.data?.candidates.map<MobileTerminalEntry>((candidate) => ({
        id: candidate.id,
        workspaceId: candidate.workspace_id,
        label: candidate.label,
        sessionId: candidate.session_id ?? undefined,
        tmuxWindowName: candidate.tmux_window_name ?? undefined,
        dynamicTitle: candidate.terminal_name ?? undefined,
        isNew: false,
      })) ?? [];

    if (serverEntries.length > 0) {
      const nextEntries = [
        ...serverEntries,
        ...entries.filter((entry) => !isRepresentedByServer(entry, serverEntries)),
      ];
      if (!sameTerminalEntries(entries, nextEntries)) {
        setEntries(workspaceId, nextEntries);
      }
      return;
    }

    if (entries.length === 0) {
      const first: MobileTerminalEntry = {
        id: `${workspaceId}:default`,
        workspaceId,
        label: "Default terminal",
        sessionId: `${workspaceId}:default`,
        isNew: true,
      };
      setEntries(workspaceId, [first]);
    }
  }, [candidates.data, entries, setEntries, workspaceId]);

  const ensuredEntries = useMemo(() => {
    if (entries.length > 0) return entries;
    return [
      {
        id: `${workspaceId}:default`,
        workspaceId,
        label: "Default terminal",
        sessionId: `${workspaceId}:default`,
        isNew: true,
      },
    ];
  }, [entries, workspaceId]);

  const activeEntry = resolveActiveTerminalEntry(ensuredEntries, activeEntryId);
  const activeSessionId = activeEntry ? activeEntry.sessionId ?? activeEntry.id : null;

  const createTerminalEntry = useCallback(() => {
    const id = `${workspaceId}:mobile-${Date.now()}`;
    addEntry({
      id,
      workspaceId,
      label: `Mobile terminal ${ensuredEntries.length + 1}`,
      sessionId: id,
      isNew: true,
    });
  }, [addEntry, ensuredEntries.length, workspaceId]);

  useEffect(() => {
    if (!onHeaderControlsChange) return undefined;

    onHeaderControlsChange({
      activeEntryId: activeEntry?.id ?? null,
      entries: ensuredEntries.map((entry) => ({ id: entry.id, label: entry.label })),
      onCreateEntry: createTerminalEntry,
      onSelectEntry: (entryId) => setActiveEntry(workspaceId, entryId),
    });

    return () => onHeaderControlsChange(null);
  }, [
    activeEntry?.id,
    createTerminalEntry,
    ensuredEntries,
    onHeaderControlsChange,
    setActiveEntry,
    workspaceId,
  ]);

  const sendTerminalInput = useCallback(
    (data: string) => {
      const client = terminalClientRef.current;
      if (!activeSessionId) {
        setTerminalError("Choose a terminal before sending input.");
        return;
      }
      if (!client?.isOpen()) {
        setTerminalError("Terminal is disconnected. Reconnect before sending input.");
        return;
      }
      try {
        client.send({
          type: "terminal_input",
          session_id: activeSessionId,
          data,
        });
        setTerminalError(null);
      } catch (error) {
        setTerminalError(error instanceof Error ? error.message : "Terminal input failed.");
      }
    },
    [activeSessionId],
  );

  const sendTerminalResize = useCallback(
    (cols: number, rows: number) => {
      terminalSizeRef.current = { cols, rows };
      if (!activeSessionId) return;
      const client = terminalClientRef.current;
      if (!client?.isOpen()) return;
      try {
        client.send({
          type: "terminal_resize",
          session_id: activeSessionId,
          cols,
          rows,
        });
      } catch {
        // Resize is opportunistic; the next terminal open will send a fresh size.
      }
    },
    [activeSessionId],
  );

  useEffect(() => {
    if (appWsState !== "open") {
      setConnectionState(
        appWsState === "connecting" ? "connecting" : appWsState === "reconnecting" ? "reconnecting" : "disconnected",
      );
      setTerminalError(
        appWsState === "connecting"
          ? null
          : appWsState === "reconnecting"
            ? "Connection to Atmos Computer is reconnecting."
            : "Connection to Atmos Computer is unavailable.",
      );
      terminalClientRef.current?.close();
      terminalClientRef.current = null;
      return undefined;
    }

    if (!activeEntry || !activeSessionId) {
      setConnectionState("disconnected");
      setTerminalError(null);
      terminalClientRef.current?.close();
      terminalClientRef.current = null;
      return undefined;
    }

    if (!terminalWsUrl) {
      setConnectionState("disconnected");
      setTerminalError("Select an online Computer to open a terminal.");
      return undefined;
    }

    const client = new TerminalWsClient(terminalWsUrl);
    const outputBatcher = createTerminalOutputBatcher({
      flush: (chunks) => webViewRef.current?.writeBase64(chunks),
    });
    terminalClientRef.current = client;
    setConnectionState("connecting");
    setTerminalError(null);

    const openActiveTerminal = () => {
      const { cols, rows } = terminalSizeRef.current;
      client.send({
        type: "terminal_open",
        session_id: activeSessionId,
        workspace_id: workspaceId,
        attach: Boolean(activeEntry.tmuxWindowName && !activeEntry.isNew),
        tmux_window_name: activeEntry.tmuxWindowName,
        project_name: projectName ?? undefined,
        workspace_name: workspaceName,
        terminal_name: activeEntry.label,
        cols,
        rows,
      });
    };

    const unsubscribeOpen = client.onOpen(openActiveTerminal);
    const unsubscribeClose = client.onClose(() => {
      setConnectionState("disconnected");
    });
    const unsubscribeError = client.onError((error) => {
      setConnectionState("disconnected");
      setTerminalError(error);
    });
    const unsubscribeState = client.onState((state) => {
      setConnectionState(terminalConnectionStateFromWs(state));
      if (state === "reconnecting") {
        setTerminalError("Terminal connection dropped. Reconnecting...");
      }
    });
    const unsubscribeMessages = client.subscribe((message) => {
      if (message.type === "terminal_output" && message.session_id === activeSessionId) {
        outputBatcher.enqueue(message.data_b64);
        return;
      }

      if (
        (message.type === "terminal_created" || message.type === "terminal_attached") &&
        message.session_id === activeSessionId
      ) {
        setConnectionState("connected");
        setTerminalError(null);
        if (message.type === "terminal_created" && activeEntry.isNew) {
          updateEntry(workspaceId, activeEntry.id, {
            isNew: false,
            tmuxWindowName: activeEntry.tmuxWindowName ?? activeEntry.label,
          });
        }
        if (message.snapshot) {
          webViewRef.current?.restoreSnapshot(message.snapshot);
        }
        webViewRef.current?.focus();
        return;
      }

      if (message.type === "terminal_error") {
        if (!message.session_id || message.session_id === activeSessionId) {
          setTerminalError(message.error);
        }
        return;
      }

      if (
        (message.type === "terminal_closed" || message.type === "terminal_destroyed") &&
        message.session_id === activeSessionId
      ) {
        setConnectionState("disconnected");
      }
    });

    client.connect();
    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      unsubscribeError();
      unsubscribeState();
      unsubscribeMessages();
      outputBatcher.clear();
      client.close();
      terminalClientRef.current = null;
    };
  }, [
    activeEntry?.id,
    activeEntry?.label,
    activeEntry?.sessionId,
    activeEntry?.tmuxWindowName,
    activeEntry?.isNew,
    activeSessionId,
    appWsState,
    projectName,
    terminalWsUrl,
    updateEntry,
    workspaceId,
    workspaceName,
  ]);

  const handleShortcut = (shortcut: TerminalShortcut) => {
    const input = getTerminalShortcutInput(shortcut);
    if (input !== null) {
      sendTerminalInput(input);
      return;
    }

    if (shortcut.kind === "action") {
      if (shortcut.action === "paste") {
        void getTerminalPasteInput(() => Clipboard.getStringAsync())
          .then((pasteInput) => {
            if (pasteInput) {
              sendTerminalInput(pasteInput);
              return;
            }
            setTerminalError("Clipboard is empty.");
          })
          .catch(() => setTerminalError("Could not read clipboard."));
        return;
      }
      if (shortcut.action === "workspace-list") router.push("/");
      if (shortcut.action === "switch-terminal") setTerminalError("Use the terminal menu in the header.");
      if (shortcut.action === "new-terminal") createTerminalEntry();
    }
  };

  return (
    <View style={styles.root}>
      {candidates.error ? (
        <GlassPanel fallbackStyle={styles.noticeFallback} glassEffectStyle="clear" style={styles.notice}>
          <Text selectable style={styles.noticeText}>
            {candidates.error instanceof Error ? candidates.error.message : "Could not load terminal list."}
          </Text>
        </GlassPanel>
      ) : null}
      {terminalError ? (
        <GlassPanel fallbackStyle={styles.errorFallback} glassEffectStyle="clear" style={styles.error}>
          <Text selectable style={styles.errorText}>
            {terminalError}
          </Text>
        </GlassPanel>
      ) : null}
      {activeEntry && activeSessionId ? (
        <TerminalWebView
          key={activeEntry.id}
          ref={webViewRef}
          connected={connectionState === "connected"}
          onInput={sendTerminalInput}
          onReady={(size) => sendTerminalResize(size.cols, size.rows)}
          onRendererError={setTerminalError}
          onResize={(size) => sendTerminalResize(size.cols, size.rows)}
          sessionId={activeSessionId}
          title={activeEntry.label}
        />
      ) : (
        <GlassPanel style={styles.choiceState}>
          <Text selectable style={styles.choiceTitle}>
            Choose a terminal
          </Text>
          <Text selectable style={styles.choiceText}>
            This workspace has multiple terminal candidates. Pick one above before attaching.
          </Text>
        </GlassPanel>
      )}
      <TerminalShortcutBar onShortcut={handleShortcut} />
    </View>
  );
}

function terminalConnectionStateFromWs(state: TerminalWsState): TerminalConnectionState {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  if (state === "reconnecting") return "reconnecting";
  return "disconnected";
}

function sameTerminalEntries(left: MobileTerminalEntry[], right: MobileTerminalEntry[]) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const next = right[index];
    return (
      entry.id === next.id &&
      entry.label === next.label &&
      entry.sessionId === next.sessionId &&
      entry.tmuxWindowName === next.tmuxWindowName &&
      entry.dynamicTitle === next.dynamicTitle &&
      entry.isNew === next.isNew
    );
  });
}

function isRepresentedByServer(entry: MobileTerminalEntry, serverEntries: MobileTerminalEntry[]) {
  return serverEntries.some((serverEntry) => {
    if (entry.id === serverEntry.id) return true;
    if (entry.sessionId && entry.sessionId === serverEntry.sessionId) return true;
    if (entry.tmuxWindowName && entry.tmuxWindowName === serverEntry.tmuxWindowName) return true;
    return false;
  });
}

const styles = StyleSheet.create({
  choiceState: {
    alignItems: "center",
    backgroundColor: colors.card,
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
  },
  choiceText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  choiceTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  error: {
    borderColor: colors.redBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorFallback: {
    backgroundColor: colors.redSurface,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    borderColor: colors.yellowBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeFallback: {
    backgroundColor: colors.yellowSurface,
  },
  noticeText: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  root: {
    flex: 1,
    gap: 10,
  },
});
