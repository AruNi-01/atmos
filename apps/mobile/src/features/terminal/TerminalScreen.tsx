import { useCallback, useEffect, useMemo, useRef } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { getTerminalDisplayMeta, type ContestedOwnersMap } from "@atmos/shared/terminal";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { TerminalWebView, type TerminalWebViewHandle } from "@/features/terminal/TerminalWebView";
import {
  MOBILE_TERMINAL_AGENTS,
  type MobileTerminalAgent,
} from "@/features/terminal/mobile-terminal-agents";
import { useContestedCliOwners } from "@/features/terminal/use-contested-cli-owners";
import {
  createMobileTerminalSessionId,
  resolveActiveTerminalEntry,
} from "@/features/terminal/terminal-selection";
import {
  getTerminalPasteInput,
  getTerminalShortcutInput,
  type TerminalShortcut,
} from "@/features/terminal/terminal-shortcuts";
import { useTerminalCandidates } from "@/features/terminal/use-terminal-candidates";
import {
  useTerminalConnection,
  type TerminalConnectionState,
} from "@/features/terminal/use-terminal-connection";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore, type MobileTerminalEntry } from "@/stores/terminal-store";
import { colors, type MobileThemeColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { BotIcon, TerminalIcon } from "@/ui/icons/lucide-native";

const EMPTY_TERMINAL_ENTRIES: MobileTerminalEntry[] = [];

export type TerminalHeaderControls = {
  activeEntryId: string | null;
  entries: Array<{ id: string; label: string }>;
  onCreateEntry: () => void;
  onSelectEntry: (entryId: string) => void;
};

export type TerminalShortcutHandler = (shortcut: TerminalShortcut) => void;
export type TerminalKeyboardDismissHandler = () => void;

export function TerminalScreen({
  onHeaderControlsChange,
  onKeyboardDismissHandlerChange,
  onShortcutHandlerChange,
  projectName,
  workspaceId,
  workspaceName,
}: {
  onHeaderControlsChange?: (controls: TerminalHeaderControls | null) => void;
  onKeyboardDismissHandlerChange?: (handler: TerminalKeyboardDismissHandler | null) => void;
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

  const activeEntry = resolveActiveTerminalEntry(ensuredEntries, activeEntryId);
  const activeSessionId = activeEntry ? activeEntry.sessionId ?? activeEntry.id : null;
  const activeDisplayMeta = activeEntry
    ? getMobileTerminalDisplayMeta(activeEntry, contestedOwners)
    : null;
  const {
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
      label: `Mobile terminal ${ensuredEntries.length + 1}`,
      sessionId: createMobileTerminalSessionId(workspaceId),
      isNew: true,
    });
  }, [addEntry, ensuredEntries.length, workspaceId]);

  useEffect(() => {
    if (!onHeaderControlsChange) return undefined;

    onHeaderControlsChange({
      activeEntryId: activeEntry?.id ?? null,
      entries: ensuredEntries.map((entry) => ({
        id: entry.id,
        label: getMobileTerminalDisplayMeta(entry, contestedOwners).displayTitle,
      })),
      onCreateEntry: createTerminalEntry,
      onSelectEntry: (entryId) => setActiveEntry(workspaceId, entryId),
    });

    return () => onHeaderControlsChange(null);
  }, [
    activeEntry?.id,
    contestedOwners,
    createTerminalEntry,
    ensuredEntries,
    onHeaderControlsChange,
    setActiveEntry,
    workspaceId,
  ]);

  const dismissKeyboard = useCallback(() => {
    webViewRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (!onKeyboardDismissHandlerChange) return undefined;

    onKeyboardDismissHandlerChange(dismissKeyboard);

    return () => onKeyboardDismissHandlerChange(null);
  }, [dismissKeyboard, onKeyboardDismissHandlerChange]);

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      if (!activeEntry) return;
      updateEntry(workspaceId, activeEntry.id, { dynamicTitle: nextTitle });
    },
    [activeEntry?.id, updateEntry, workspaceId],
  );

  const handleOscTitleChange = useCallback(
    (nextTitle: string | undefined) => {
      if (!activeEntry) return;
      updateEntry(workspaceId, activeEntry.id, { oscTitle: nextTitle });
    },
    [activeEntry?.id, updateEntry, workspaceId],
  );

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
        if (shortcut.action === "switch-terminal") setTerminalError("Use the terminal menu in the header.");
        if (shortcut.action === "new-terminal") createTerminalEntry();
      }
    },
    [createTerminalEntry, router, sendTerminalInput],
  );

  useEffect(() => {
    if (!onShortcutHandlerChange) return undefined;

    onShortcutHandlerChange(handleShortcut);

    return () => onShortcutHandlerChange(null);
  }, [handleShortcut, onShortcutHandlerChange]);

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
      {terminalError ? (
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
          <MobileTerminalHeader
            connectionState={connectionState}
            colors={theme.colors}
            title={activeDisplayMeta?.displayTitle ?? ""}
            toolbarAgent={activeDisplayMeta?.toolbarAgent}
          />
          <TerminalWebView
            key={activeEntry.id}
            ref={webViewRef}
            connected={connectionState === "connected"}
            onInput={sendTerminalInput}
            onReady={(size) => sendTerminalResize(size.cols, size.rows)}
            onRendererError={setTerminalError}
            onResize={(size) => sendTerminalResize(size.cols, size.rows)}
            onTitleChange={handleTitleChange}
            onOscTitleChange={handleOscTitleChange}
            sessionId={activeSessionId}
          />
        </View>
      ) : (
        <View style={[styles.choiceState, { backgroundColor: theme.colors.cardElevated }]}>
          <Text selectable style={[styles.choiceTitle, { color: theme.colors.label }]}>
            Choose a terminal
          </Text>
          <Text selectable style={[styles.choiceText, { color: theme.colors.secondaryLabel }]}>
            This workspace has multiple terminal candidates. Pick one above before attaching.
          </Text>
        </View>
      )}
    </View>
  );
}

function getMobileTerminalDisplayMeta(
  entry: MobileTerminalEntry,
  contestedOwners?: ContestedOwnersMap,
) {
  return getTerminalDisplayMeta({
    baseTitle: entry.label,
    configuredAgents: MOBILE_TERMINAL_AGENTS,
    dynamicTitle: entry.dynamicTitle,
    oscTitle: entry.oscTitle,
    contestedOwners,
  });
}

function MobileTerminalHeader({
  connectionState,
  colors: themeColors,
  title,
  toolbarAgent,
}: {
  connectionState: TerminalConnectionState;
  colors: MobileThemeColors;
  title: string;
  toolbarAgent?: MobileTerminalAgent;
}) {
  const statusLabel = connectionState === "connected" ? null : terminalConnectionStatusLabel(connectionState);

  return (
    <View style={[styles.terminalHeader, { backgroundColor: themeColors.terminalBg }]}>
      {toolbarAgent?.iconType === "built-in" ? (
        <MobileAgentIcon agentId={toolbarAgent.id} size={18} />
      ) : toolbarAgent?.iconType === "custom" ? (
        <BotIcon color={themeColors.terminalMuted} size={18} strokeWidth={2.4} />
      ) : (
        <TerminalIcon color={themeColors.terminalMuted} size={18} strokeWidth={2.2} />
      )}
      <Text
        style={[styles.terminalTitle, { color: themeColors.terminalFg }]}
        numberOfLines={1}
      >
        {title || "Terminal"}
      </Text>
      {statusLabel ? (
        <View style={[styles.terminalStatusPill, { backgroundColor: themeColors.terminalKeycap }]}>
          <Text style={[styles.terminalStatusText, { color: themeColors.terminalMuted }]}>{statusLabel}</Text>
        </View>
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.terminalHeaderSeparator, { backgroundColor: themeColors.glassBorder }]}
      />
    </View>
  );
}

function terminalConnectionStatusLabel(connectionState: TerminalConnectionState) {
  if (connectionState === "connecting") return "Connecting";
  if (connectionState === "reconnecting") return "Reconnecting";
  return "Disconnected";
}

const styles = StyleSheet.create({
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
  terminalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.terminalKeycapGap,
    minHeight: spacing.terminalHeaderMinHeight,
    paddingHorizontal: spacing.terminalHeaderX,
  },
  terminalHeaderSeparator: {
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: spacing.terminalHeaderX,
    position: "absolute",
    right: spacing.terminalHeaderX,
  },
  terminalShell: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  terminalStatusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  terminalStatusText: {
    ...typography.terminalStatus,
  },
  terminalTitle: {
    ...typography.terminalTitle,
    flex: 1,
  },
});
