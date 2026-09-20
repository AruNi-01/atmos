import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import { TerminalTabsBar } from "@/features/terminal/TerminalTabsBar";
import { WorkspaceSwitcherPopover } from "@/features/terminal/WorkspaceSwitcherPopover";
import {
  createMobileTerminalSessionId,
  nextActiveTerminalEntryId,
  resolveActiveTerminalEntry,
} from "@/features/terminal/terminal-selection";
import {
  getTerminalShortcutInput,
  type TerminalShortcut,
} from "@/features/terminal/terminal-shortcuts";
import {
  PREVIEW_COMPUTER,
  PREVIEW_WORKSPACE_CHOICES,
  previewEntriesForWorkspace,
  previewTranscript,
  previewWorkspaceById,
  sortPreviewEntries,
} from "@/features/preview/preview-fixtures";
import { PreviewModeSwitch } from "@/features/preview/PreviewModeSwitch";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import { colors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { TerminalIcon } from "@/ui/icons/lucide-native";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";

const FIRST_WORKSPACE_ID = PREVIEW_WORKSPACE_CHOICES[0]!.id;

export function PreviewTerminalScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(FIRST_WORKSPACE_ID);
  const [entriesByWorkspace, setEntriesByWorkspace] = useState<Record<string, MobileTerminalEntry[]>>(() => ({
    [FIRST_WORKSPACE_ID]: previewEntriesForWorkspace(FIRST_WORKSPACE_ID),
  }));
  const [activeByWorkspace, setActiveByWorkspace] = useState<Record<string, string | null>>(() => ({
    [FIRST_WORKSPACE_ID]: nextActiveTerminalEntryId(
      previewEntriesForWorkspace(FIRST_WORKSPACE_ID),
      null,
    ),
  }));
  const [extraLinesByEntry, setExtraLinesByEntry] = useState<Record<string, string[]>>({});
  const [groupOpen, setGroupOpen] = useState(false);

  const workspace = previewWorkspaceById(workspaceId);
  const entries = entriesByWorkspace[workspaceId] ?? previewEntriesForWorkspace(workspaceId);
  const activeEntry = resolveActiveTerminalEntry(entries, activeByWorkspace[workspaceId]);
  const tabItems = useMemo(
    () => entries.map((entry) => ({ id: entry.id, label: entry.label })),
    [entries],
  );
  const transcript = previewTranscript(
    workspaceId,
    activeEntry?.id ?? "",
    extraLinesByEntry[activeEntry?.id ?? ""] ?? [],
  );

  const selectWorkspace = useCallback((nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setEntriesByWorkspace((current) => {
      if (current[nextWorkspaceId]) return current;
      return {
        ...current,
        [nextWorkspaceId]: previewEntriesForWorkspace(nextWorkspaceId),
      };
    });
    setActiveByWorkspace((current) => {
      if (current[nextWorkspaceId]) return current;
      const nextEntries = previewEntriesForWorkspace(nextWorkspaceId);
      return {
        ...current,
        [nextWorkspaceId]: nextActiveTerminalEntryId(nextEntries, null),
      };
    });
  }, []);

  const selectEntry = useCallback(
    (entryId: string) => {
      setActiveByWorkspace((current) => ({ ...current, [workspaceId]: entryId }));
      setGroupOpen(false);
    },
    [workspaceId],
  );

  const createTerminalEntry = useCallback(() => {
    const id = `${workspaceId}:mobile-${Date.now()}`;
    const entry: MobileTerminalEntry = {
      id,
      workspaceId,
      label: `Terminal ${entries.length + 1}`,
      sessionId: createMobileTerminalSessionId(workspaceId),
      isNew: true,
    };
    setEntriesByWorkspace((current) => ({
      ...current,
      [workspaceId]: sortPreviewEntries([...(current[workspaceId] ?? entries), entry]),
    }));
    setActiveByWorkspace((current) => ({ ...current, [workspaceId]: id }));
    setExtraLinesByEntry((current) => ({
      ...current,
      [id]: [],
    }));
  }, [entries, workspaceId]);

  const appendLine = useCallback(
    (line: string) => {
      if (!activeEntry) return;
      setExtraLinesByEntry((current) => ({
        ...current,
        [activeEntry.id]: [...(current[activeEntry.id] ?? []), line],
      }));
    },
    [activeEntry],
  );

  const handleShortcut = useCallback(
    (shortcut: TerminalShortcut) => {
      const input = getTerminalShortcutInput(shortcut);
      if (input !== null) {
        appendLine(`$ ${describeShortcut(shortcut)}`);
        return;
      }
      if (shortcut.kind !== "action") return;
      if (shortcut.action === "paste") {
        appendLine("$ [paste] mock clipboard");
        return;
      }
      if (shortcut.action === "workspace-list") {
        router.replace("/");
        return;
      }
      if (shortcut.action === "switch-terminal") {
        setGroupOpen(true);
        return;
      }
      if (shortcut.action === "new-terminal") {
        createTerminalEntry();
      }
    },
    [appendLine, createTerminalEntry, router],
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions("Test page", theme.colors),
          contentStyle: { backgroundColor: theme.colors.terminalBg },
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => <PreviewModeSwitch variant="header" />,
        }}
      />
      <View style={[styles.root, { backgroundColor: theme.colors.terminalBg }]}>
        <TerminalTabsBar
          activeEntryId={activeEntry?.id ?? null}
          entries={tabItems}
          leading={
            <WorkspaceSwitcherPopover
              currentId={workspaceId}
              currentName={workspace.name}
              onSelect={selectWorkspace}
              workspaces={PREVIEW_WORKSPACE_CHOICES}
            />
          }
          onCreate={createTerminalEntry}
          onOpenGroup={() => setGroupOpen(true)}
          onSelect={selectEntry}
        />
        <View style={[styles.header, { backgroundColor: theme.colors.terminalBg }]}>
          <TerminalIcon color={theme.colors.terminalMuted} size={18} strokeWidth={2.2} />
          <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.terminalFg }]}>
            {activeEntry?.label ?? "Terminal"}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: theme.colors.terminalKeycap }]}>
            <Text style={[styles.statusText, { color: theme.colors.terminalMuted }]}>
              Mock · {PREVIEW_COMPUTER.display_name}
            </Text>
          </View>
          <View
            pointerEvents="none"
            style={[styles.headerSeparator, { backgroundColor: theme.colors.glassBorder }]}
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.transcriptContent}
          style={[styles.transcript, { backgroundColor: theme.colors.terminalBg }]}
        >
          {transcript.map((line, index) => (
            <Text key={`${index}:${line}`} selectable style={styles.transcriptLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.cursor}>█</Text>
        </ScrollView>
        <TerminalShortcutBar enabled onShortcut={handleShortcut} />
        <ExpoDrawer isPresented={groupOpen} onDismiss={() => setGroupOpen(false)}>
          <Text style={[styles.drawerTitle, { color: theme.colors.label }]}>Terminals</Text>
          {tabItems.map((entry) => {
            const selected = entry.id === activeEntry?.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={entry.id}
                onPress={() => selectEntry(entry.id)}
                style={({ pressed }) => [
                  styles.drawerRow,
                  pressed ? { backgroundColor: theme.colors.mutedPressed } : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.drawerRowLabel,
                    { color: selected ? theme.colors.label : theme.colors.secondaryLabel },
                  ]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </ExpoDrawer>
      </View>
    </>
  );
}

function describeShortcut(shortcut: TerminalShortcut): string {
  if (shortcut.kind === "sequence") return shortcut.id;
  if (shortcut.kind === "text") return shortcut.insertText;
  return shortcut.id;
}

const styles = StyleSheet.create({
  cursor: {
    color: colors.terminalFg,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    opacity: 0.7,
  },
  drawerRow: {
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 10,
  },
  drawerRowLabel: {
    fontSize: 17,
    lineHeight: 22,
  },
  drawerTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.terminalKeycapGap,
    minHeight: spacing.terminalHeaderMinHeight,
    paddingHorizontal: spacing.terminalHeaderX,
  },
  headerSeparator: {
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: spacing.terminalHeaderX,
    position: "absolute",
    right: spacing.terminalHeaderX,
  },
  headerTitle: {
    ...typography.terminalTitle,
    flex: 1,
  },
  root: {
    flex: 1,
    minHeight: 0,
  },
  statusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    ...typography.terminalStatus,
  },
  transcript: {
    flex: 1,
    minHeight: 0,
  },
  transcriptContent: {
    gap: 2,
    paddingHorizontal: spacing.terminalHeaderX,
    paddingVertical: 12,
  },
  transcriptLine: {
    color: colors.terminalFg,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    lineHeight: 18,
  },
});
