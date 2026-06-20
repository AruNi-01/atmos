import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { GlassContainer } from "expo-glass-effect";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { NativeMenuButton, selectNativeIcon } from "@/ui/primitives/native-controls";
import type { NativeMenuAction } from "@/ui/primitives/native-controls";
import { ChangesScreen } from "@/features/git/ChangesScreen";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import {
  TerminalScreen,
  type TerminalHeaderControls,
  type TerminalShortcutHandler,
} from "@/features/terminal/TerminalScreen";
import { WorkspaceTabs } from "@/features/workspaces/WorkspaceTabs";
import type { WorkspaceTab, WorkspaceTabItem } from "@/features/workspaces/WorkspaceTabs.types";
import { WorkspaceOverview } from "@/features/workspaces/WorkspaceOverview";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { wsActions } from "@/api/ws-actions";
import { colors } from "@/theme/colors";

const TERMINAL_MENU_ICON = selectNativeIcon({
  ios: "terminal.fill",
  android: require("../../../assets/icons/terminal.xml"),
});

const NEW_TERMINAL_ACTION_ID = "__new-terminal";

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const insets = useSafeAreaInsets();
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const [tab, setTab] = useState<WorkspaceTab>("terminal");
  const [terminalHeaderControls, setTerminalHeaderControls] = useState<TerminalHeaderControls | null>(null);
  const [terminalShortcutHandler, setTerminalShortcutHandler] = useState<TerminalShortcutHandler | null>(null);

  const handleTerminalShortcutHandlerChange = useCallback((handler: TerminalShortcutHandler | null) => {
    setTerminalShortcutHandler(() => handler);
  }, []);

  const bootstrap = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, state],
    enabled: Boolean(client && state === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const workspace = useMemo(() => {
    return Object.values(bootstrap.data?.workspaces_by_project ?? {})
      .flat()
      .find((candidate) => candidate.guid === workspaceId);
  }, [bootstrap.data, workspaceId]);

  const project = useMemo(() => {
    if (!workspace) return null;
    return bootstrap.data?.projects.find((candidate) => candidate.guid === workspace.project_guid) ?? null;
  }, [bootstrap.data, workspace]);

  if (!workspace && bootstrap.isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeCompactTitleOptions("Workspace"),
            headerBackButtonDisplayMode: "minimal",
            headerRight: undefined,
          }}
        />
        <WorkspaceStateScreen>
          <EmptyState title="Loading workspace" message="Fetching from Computer." />
        </WorkspaceStateScreen>
      </>
    );
  }

  if (!workspace) {
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeCompactTitleOptions("Workspace"),
            headerBackButtonDisplayMode: "minimal",
            headerRight: undefined,
          }}
        />
        <WorkspaceStateScreen>
          <EmptyState title="Workspace unavailable" message="Select an online Computer." />
          <InlineError message={bootstrap.error instanceof Error ? bootstrap.error.message : null} />
        </WorkspaceStateScreen>
      </>
    );
  }

  const workspaceTitle = workspace.display_name ?? workspace.name;
  const tabItems: WorkspaceTabItem[] = [
    {
      androidIcon: require("../../../assets/icons/terminal.xml"),
      iosSystemImage: "terminal.fill",
      label: "Terminal",
      value: "terminal",
      children: (
        <View style={styles.content}>
          <TerminalScreen
            onHeaderControlsChange={setTerminalHeaderControls}
            onShortcutHandlerChange={handleTerminalShortcutHandlerChange}
            projectName={project?.name ?? null}
            workspaceId={workspace.guid}
            workspaceName={workspace.name}
          />
        </View>
      ),
    },
    {
      androidIcon: require("../../../assets/icons/changes.xml"),
      iosSystemImage: "list.bullet.rectangle.fill",
      label: "Changes",
      value: "changes",
      children: (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          style={styles.changesScroll}
          contentContainerStyle={styles.changesContent}
        >
          <ChangesScreen repoPath={workspace.local_path} />
        </ScrollView>
      ),
    },
    {
      androidIcon: require("../../../assets/icons/overview.xml"),
      iosSystemImage: "info.circle.fill",
      label: "Overview",
      value: "overview",
      children: (
        <View style={styles.content}>
          <WorkspaceOverview project={project} workspace={workspace} />
        </View>
      ),
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions(workspaceTitle),
          headerBackButtonDisplayMode: "minimal",
          headerRight: () =>
            tab === "terminal" ? <TerminalHeaderMenu controls={terminalHeaderControls} /> : null,
        }}
      />
      <GlassContainer spacing={12} style={styles.root}>
        <WorkspaceTabs bottomInset={insets.bottom} items={tabItems} onSelectTab={setTab} selectedTab={tab} />
        {terminalShortcutHandler ? (
          <TerminalShortcutBar
            enabled={tab === "terminal"}
            onShortcut={terminalShortcutHandler}
          />
        ) : null}
      </GlassContainer>
    </>
  );
}

function WorkspaceStateScreen({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <GlassContainer spacing={12} style={styles.root}>
      <View style={styles.stateContent}>{children}</View>
    </GlassContainer>
  );
}

function TerminalHeaderMenu({ controls }: { controls: TerminalHeaderControls | null }) {
  const activeEntry = controls?.entries.find((entry) => entry.id === controls.activeEntryId) ?? null;
  const actions: NativeMenuAction[] = controls
    ? [
        ...controls.entries.map<NativeMenuAction>((entry) => ({
          id: entry.id,
          image: TERMINAL_MENU_ICON,
          state: entry.id === controls.activeEntryId ? "on" : "off",
          title: entry.label,
        })),
        {
          id: NEW_TERMINAL_ACTION_ID,
          image: "plus",
          title: "New Terminal",
        },
      ]
    : [
        {
          id: "loading",
          title: "Loading",
          attributes: { disabled: true },
        },
      ];

  return (
    <NativeMenuButton
      actions={actions}
      androidIcon={require("../../../assets/icons/terminal.xml")}
      disabled={!controls}
      iconOnly
      label={terminalMenuLabel(activeEntry?.label ?? "Terminal")}
      onAction={(actionId) => {
        if (!controls) return;
        if (actionId === NEW_TERMINAL_ACTION_ID) {
          controls.onCreateEntry();
          return;
        }
        controls.onSelectEntry(actionId);
      }}
      systemImage="terminal.fill"
      title="Terminal"
    />
  );
}

function terminalMenuLabel(label: string) {
  const maxLength = 18;
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 3)}...`;
}

const styles = StyleSheet.create({
  changesContent: {
    paddingBottom: 32,
  },
  changesScroll: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 10,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stateContent: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
});
