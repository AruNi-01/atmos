import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { rowsForTerminalEntries } from "@/features/sessions/scoped-session-rows";
import { useSessionInbox } from "@/features/sessions/use-session-inbox";
import { TerminalGroupDrawer } from "@/features/terminal/TerminalGroupDrawer";
import { TerminalWebView, type TerminalWebViewHandle } from "@/features/terminal/TerminalWebView";
import { useContestedCliOwners } from "@/features/terminal/use-contested-cli-owners";
import {
  createMobileTerminalSessionId,
  resolveActiveTerminalEntry,
} from "@/features/terminal/terminal-selection";
import { resolveMobileTerminalHeading } from "@/features/terminal/terminal-heading";
import {
  getTerminalPasteInput,
  getTerminalShortcutInput,
  type TerminalShortcut,
} from "@/features/terminal/terminal-shortcuts";
import { useTerminalCandidates } from "@/features/terminal/use-terminal-candidates";
import { useTerminalConnection } from "@/features/terminal/use-terminal-connection";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore, type MobileTerminalEntry } from "@/stores/terminal-store";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

const EMPTY_TERMINAL_ENTRIES: MobileTerminalEntry[] = [];

export type TerminalWorkspaceChoice = {
  id: string;
  name: string;
};

export type TerminalShortcutHandler = (shortcut: TerminalShortcut) => void;
export type TerminalKeyboardHandler = () => void;
export type TerminalHeaderActions = {
  createTerminal: () => void;
  openTerminalList: () => void;
};

export type TerminalHeading = {
  agentId?: string;
  title: string;
};

export function TerminalScreen({
  onDisplayTitleChange,
  onHeaderActionsChange,
  onKeyboardHandlerChange,
  onShortcutHandlerChange,
  projectName,
  workspaceId,
  workspaceName,
}: {
  onDisplayTitleChange?: (heading: TerminalHeading) => void;
  onHeaderActionsChange?: (actions: TerminalHeaderActions | null) => void;
  onKeyboardHandlerChange?: (handler: TerminalKeyboardHandler | null) => void;
  onShortcutHandlerChange?: (handler: TerminalShortcutHandler | null) => void;
  projectName?: string | null;
  workspaceId: string;
  workspaceName: string;
}) {
  const theme = useMobileTheme();
  const router = useRouter();
  const { client: appWsClient, state: appWsState } = useMobileWs();
  const entries = useTerminalStore((state) => state.entriesByWorkspaceId[workspaceId] ?? EMPTY_TERMINAL_ENTRIES);
  const activeEntryId = useTerminalStore((state) => state.activeEntryIdByWorkspaceId[workspaceId]);
  const setEntries = useTerminalStore((state) => state.setEntries);
  const setActiveEntry = useTerminalStore((state) => state.setActiveEntry);
  const addEntry = useTerminalStore((state) => state.addEntry);
  const updateEntry = useTerminalStore((state) => state.updateEntry);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const terminalWsUrl = useSessionStore((state) => state.activeClientSession?.terminal_ws_url);
  const contestedOwners = useContestedCliOwners();
  const webViewRef = useRef<TerminalWebViewHandle>(null);
  const [rendererReadyFor, setRendererReadyFor] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);

  const candidates = useTerminalCandidates({
    appWsClient,
    appWsState,
    entries,
    projectName,
    selectedServerId,
    setEntries,
    workspaceId,
    workspaceName,
  });

  const ensuredEntries = useMemo(() => {
    if (entries.length > 0) return entries;
    return EMPTY_TERMINAL_ENTRIES;
  }, [entries]);

  const inbox = useSessionInbox();
  const sheetRows = useMemo(
    () =>
      rowsForTerminalEntries(ensuredEntries, inbox.rows, (entry) =>
        resolveMobileTerminalHeading({
          baseTitle: entry.label,
          contestedOwners,
          dynamicTitle: entry.dynamicTitle,
          oscTitle: entry.oscTitle,
          sessionOscTitle: entry.sessionOscTitle,
        }).title,
      ),
    [contestedOwners, ensuredEntries, inbox.rows],
  );

  const activeEntry = resolveActiveTerminalEntry(ensuredEntries, activeEntryId);
  const activeEntryIdForTitle = activeEntry?.id;
  const activeSessionId = activeEntry ? activeEntry.sessionId ?? activeEntry.id : null;
  const activeDisplayMeta = activeEntry
    ? resolveMobileTerminalHeading({
        baseTitle: activeEntry.label,
        contestedOwners,
        dynamicTitle: activeEntry.dynamicTitle,
        oscTitle: activeEntry.oscTitle,
        sessionOscTitle: activeEntry.sessionOscTitle,
      })
    : null;
  const navigationHeading = {
    agentId: activeDisplayMeta?.agentId,
    title: activeDisplayMeta?.title ?? "Terminal",
  };
  const {
    attached,
    connectionState,
    sendTerminalInput,
    sendTerminalResize,
    setTerminalError,
    terminalError,
  } = useTerminalConnection({
    activeEntry,
    activeSessionId,
    appWsState,
    projectName,
    terminalWsUrl,
    updateEntry,
    webViewRef,
    workspaceId,
    workspaceName,
  });

  const createTerminalEntry = useCallback(() => {
    const id = `${workspaceId}:mobile-${Date.now()}`;
    addEntry({
      id,
      workspaceId,
      label: `Terminal ${ensuredEntries.length + 1}`,
      sessionId: createMobileTerminalSessionId(workspaceId),
      isNew: true,
    });
  }, [addEntry, ensuredEntries.length, workspaceId]);

  const selectEntry = useCallback(
    (entryId: string) => {
      setActiveEntry(workspaceId, entryId);
      setGroupOpen(false);
    },
    [setActiveEntry, workspaceId],
  );

  const openTerminalList = useCallback(() => {
    setGroupOpen(true);
  }, []);

  useEffect(() => {
    onDisplayTitleChange?.(navigationHeading);
  }, [navigationHeading.agentId, navigationHeading.title, onDisplayTitleChange]);

  useEffect(() => {
    onHeaderActionsChange?.({
      createTerminal: createTerminalEntry,
      openTerminalList,
    });
    return () => onHeaderActionsChange?.(null);
  }, [createTerminalEntry, onHeaderActionsChange, openTerminalList]);

  const toggleKeyboard = useCallback(() => {
    if (Keyboard.isVisible()) {
      webViewRef.current?.blur();
      Keyboard.dismiss();
      return;
    }
    webViewRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!onKeyboardHandlerChange) return undefined;

    onKeyboardHandlerChange(toggleKeyboard);

    return () => onKeyboardHandlerChange(null);
  }, [onKeyboardHandlerChange, toggleKeyboard]);

  const handleCopyText = useCallback(async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
  }, []);

  const handlePaste = useCallback(async () => {
    const pasteInput = await getTerminalPasteInput(() => Clipboard.getStringAsync());
    if (pasteInput) sendTerminalInput(pasteInput);
  }, [sendTerminalInput]);

  const handleReady = useCallback(
    (size: { cols: number; rows: number }) => {
      setRendererReadyFor(activeEntryIdForTitle ?? null);
      sendTerminalResize(size.cols, size.rows);
    },
    [activeEntryIdForTitle, sendTerminalResize],
  );

  const handleTitleChange = useCallback((_nextTitle: string) => {
    // The computer stores the title and pushes terminal_title_updated.
  }, []);

  const handleOscTitleChange = useCallback((_nextTitle: string | undefined) => {
    // The computer stores the title and pushes terminal_title_updated.
  }, []);

  const handleShortcut = useCallback(
    (shortcut: TerminalShortcut) => {
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
        if (shortcut.action === "switch-terminal") openTerminalList();
        if (shortcut.action === "new-terminal") createTerminalEntry();
      }
    },
    [createTerminalEntry, openTerminalList, router, sendTerminalInput, setTerminalError],
  );

  useEffect(() => {
    if (!onShortcutHandlerChange) return undefined;

    onShortcutHandlerChange(handleShortcut);

    return () => onShortcutHandlerChange(null);
  }, [handleShortcut, onShortcutHandlerChange]);

  const rendererReady = rendererReadyFor === activeEntry?.id;
  const booting = Boolean(activeEntry && activeSessionId && (!rendererReady || !attached));
  const showBootOverlay = booting || connectionState === "reconnecting";
  const bootFailed = Boolean(terminalError && !attached && connectionState === "disconnected");
  const bootLabel = bootFailed
    ? terminalError
    : connectionState === "reconnecting"
      ? "Reconnecting"
      : "Connecting";

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.terminalBg }]}>
      {candidates.error ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.colors.yellowSurface, borderColor: theme.colors.yellowBorder },
          ]}
        >
          <Text selectable style={[styles.noticeText, { color: theme.colors.secondaryLabel }]}>
            {candidates.error instanceof Error ? candidates.error.message : "Could not load terminal list."}
          </Text>
        </View>
      ) : null}
      {terminalError && !showBootOverlay ? (
        <View
          style={[
            styles.error,
            { backgroundColor: theme.colors.redSurface, borderColor: theme.colors.redBorder },
          ]}
        >
          <Text selectable style={[styles.errorText, { color: theme.colors.red }]}>
            {terminalError}
          </Text>
        </View>
      ) : null}
      {activeEntry && activeSessionId ? (
        <View style={[styles.terminalShell, { backgroundColor: theme.colors.terminalBg }]}>
          <TerminalWebView
            key={activeEntry.id}
            ref={webViewRef}
            connected={connectionState === "connected"}
            onInput={sendTerminalInput}
            onReady={handleReady}
            onRendererError={setTerminalError}
            onResize={handleReady}
            onTitleChange={handleTitleChange}
            onOscTitleChange={handleOscTitleChange}
            onCopyText={(text) => {
              void handleCopyText(text);
            }}
            onPaste={() => {
              void handlePaste();
            }}
            sessionId={activeSessionId}
          />
          {showBootOverlay ? (
            <View style={[styles.bootOverlay, { backgroundColor: theme.colors.terminalBg }]}>
              {bootFailed ? null : <ActivityIndicator color={theme.colors.terminalFg} />}
              <Text style={[styles.bootLabel, { color: bootFailed ? theme.colors.red : theme.colors.terminalMuted }]}>
                {bootLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.choiceState, { backgroundColor: theme.colors.cardElevated }]}>
          <Text selectable style={[styles.choiceTitle, { color: theme.colors.label }]}>
            Choose a terminal
          </Text>
          <Text selectable style={[styles.choiceText, { color: theme.colors.secondaryLabel }]}>
            Open the terminal list to choose one.
          </Text>
        </View>
      )}
      <TerminalGroupDrawer
        isPresented={groupOpen}
        onDismiss={() => setGroupOpen(false)}
        onSelect={selectEntry}
        rows={sheetRows}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bootLabel: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  bootOverlay: {
    alignItems: "center",
    bottom: 0,
    gap: 12,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
  },
  choiceState: {
    alignItems: "center",
    backgroundColor: colors.cardElevated,
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
    backgroundColor: colors.redSurface,
    borderColor: colors.redBorder,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    backgroundColor: colors.yellowSurface,
    borderColor: colors.yellowBorder,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeText: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  root: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  terminalShell: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
});
