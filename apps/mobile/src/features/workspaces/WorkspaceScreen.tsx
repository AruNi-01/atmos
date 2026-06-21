import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type KeyboardEvent,
} from "react-native";
import { Stack, type NativeStackHeaderItem } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { ChangesScreen } from "@/features/git/ChangesScreen";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import {
  TerminalScreen,
  type TerminalHeaderControls,
  type TerminalKeyboardDismissHandler,
  type TerminalShortcutHandler,
} from "@/features/terminal/TerminalScreen";
import type { WorkspaceTab, WorkspaceTabItem } from "@/features/workspaces/WorkspaceTabs.types";
import { WorkspaceHeaderActions } from "@/features/workspaces/WorkspaceHeaderActions";
import { WorkspaceOverview } from "@/features/workspaces/WorkspaceOverview";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useRecentWorkspacesStore } from "@/stores/recent-workspaces-store";
import { useSessionStore } from "@/stores/session-store";
import { wsActions } from "@/api/ws-actions";
import { colors, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const theme = useMobileTheme();
  const { client, state } = useMobileWs();
  const recordWorkspaceVisit = useRecentWorkspacesStore((store) => store.recordWorkspaceVisit);
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const [tab, setTab] = useState<WorkspaceTab>("terminal");
  const [terminalHeaderControls, setTerminalHeaderControls] = useState<TerminalHeaderControls | null>(null);
  const [terminalKeyboardDismissHandler, setTerminalKeyboardDismissHandler] =
    useState<TerminalKeyboardDismissHandler | null>(null);
  const [terminalShortcutHandler, setTerminalShortcutHandler] = useState<TerminalShortcutHandler | null>(null);
  const { keyboardInset, onKeyboardInsetTargetLayout, keyboardInsetTargetRef } = useKeyboardInset();

  const handleTerminalKeyboardDismissHandlerChange = useCallback((handler: TerminalKeyboardDismissHandler | null) => {
    setTerminalKeyboardDismissHandler(() => handler);
  }, []);

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

  useEffect(() => {
    if (!workspace) return;
    recordWorkspaceVisit({ project, serverId: selectedServerId, workspace });
  }, [project, recordWorkspaceVisit, selectedServerId, workspace]);

  if (!workspace && bootstrap.isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeCompactTitleOptions("Workspace", theme.colors),
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
            ...nativeCompactTitleOptions("Workspace", theme.colors),
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
      iosSystemImage: "terminal",
      label: "Terminal",
      value: "terminal",
      children: (
        <View style={styles.terminalContent}>
          <TerminalScreen
            onHeaderControlsChange={setTerminalHeaderControls}
            onKeyboardDismissHandlerChange={handleTerminalKeyboardDismissHandlerChange}
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
  const activeTab = tabItems.find((item) => item.value === tab) ?? tabItems[0];
  const content = (
    <>
      {activeTab?.children}
      {terminalShortcutHandler ? (
        <TerminalShortcutBar
          enabled={tab === "terminal"}
          onDismissKeyboard={terminalKeyboardDismissHandler ?? undefined}
          onShortcut={terminalShortcutHandler}
        />
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions(workspaceTitle, theme.colors),
          contentStyle: {
            backgroundColor: tab === "terminal" ? theme.colors.terminalBg : theme.colors.background,
          },
          headerBackButtonDisplayMode: "minimal",
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <WorkspaceHeaderActions
                    onSelectTab={setTab}
                    selectedTab={tab}
                    tabs={tabItems.map(({ androidIcon, iosSystemImage, label, value }) => ({
                      androidIcon,
                      iosSystemImage,
                      label,
                      value,
                    }))}
                    terminalControls={terminalHeaderControls}
                  />
                ),
          unstable_headerRightItems:
            Platform.OS === "ios"
              ? () =>
                  buildHeaderRightItems({
                    onSelectTab: setTab,
                    selectedTab: tab,
                    tabs: tabItems.map(({ iosSystemImage, label, value }) => ({
                      iosSystemImage,
                      label,
                      value,
                    })),
                    terminalControls: terminalHeaderControls,
                    colors: theme.colors,
                  })
              : undefined,
        }}
      />
      {tab === "terminal" ? (
        <View
          ref={keyboardInsetTargetRef}
          collapsable={false}
          onLayout={onKeyboardInsetTargetLayout}
          style={[styles.root, styles.terminalRoot, { backgroundColor: theme.colors.terminalBg, paddingBottom: keyboardInset }]}
        >
          {content}
        </View>
      ) : (
        <View style={[styles.root, styles.defaultRoot, { backgroundColor: theme.colors.background }]}>{content}</View>
      )}
    </>
  );
}

function buildHeaderRightItems({
  onSelectTab,
  selectedTab,
  tabs,
  terminalControls,
  colors: themeColors = colors,
}: {
  colors?: MobileThemeColors;
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedTab: WorkspaceTab;
  tabs: Array<{ iosSystemImage: SFSymbol; label: string; value: WorkspaceTab }>;
  terminalControls: TerminalHeaderControls | null;
}): NativeStackHeaderItem[] {
  const activeTab = tabs.find((tab) => tab.value === selectedTab) ?? tabs[0];
  const sharedButtonProps = {
    sharesBackground: true,
    tintColor: themeColors.label,
    variant: "plain" as const,
  };

  return [
    {
      ...sharedButtonProps,
      accessibilityLabel: "Workspace view",
      icon: sfSymbol(activeTab?.iosSystemImage ?? "rectangle.3.group"),
      identifier: "workspace-view-menu",
      label: activeTab?.label ?? "View",
      menu: {
        items: tabs.map((tab) => ({
          icon: sfSymbol(tab.iosSystemImage),
          label: tab.label,
          onPress: () => onSelectTab(tab.value),
          state: tab.value === selectedTab ? "on" : "off",
          type: "action" as const,
        })),
        title: "View",
      },
      type: "menu",
    },
    {
      ...sharedButtonProps,
      accessibilityLabel: "Terminal menu",
      icon: sfSymbol("ellipsis"),
      identifier: "workspace-terminal-menu",
      label: "Terminal",
      menu: {
        items: terminalControls
          ? [
              ...terminalControls.entries.map((entry) => ({
                label: entry.label,
                onPress: () => terminalControls.onSelectEntry(entry.id),
                state: entry.id === terminalControls.activeEntryId ? ("on" as const) : ("off" as const),
                type: "action" as const,
              })),
              {
                icon: sfSymbol("plus"),
                label: "New Terminal",
                onPress: terminalControls.onCreateEntry,
                type: "action" as const,
              },
            ]
          : [
              {
                disabled: true,
                label: "Loading",
                onPress: () => {},
                type: "action" as const,
              },
            ],
        title: "Terminal",
      },
      type: "menu",
    },
  ];
}

function sfSymbol(name: SFSymbol) {
  return { name, type: "sfSymbol" as const };
}

function useKeyboardInset() {
  const targetRef = useRef<View>(null);
  const keyboardFrameRef = useRef<KeyboardEvent["endCoordinates"] | null>(null);
  const targetFrameRef = useRef<{ height: number; y: number } | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const applyKeyboardFrame = useCallback((keyboardFrame: KeyboardEvent["endCoordinates"]) => {
    const targetFrame = targetFrameRef.current;
    if (!targetFrame) return;

    setKeyboardInset(Math.max(0, Math.round(targetFrame.y + targetFrame.height - keyboardFrame.screenY)));
  }, []);

  const measureTarget = useCallback(() => {
    targetRef.current?.measureInWindow((_x, y, _width, height) => {
      targetFrameRef.current = { height, y };
      if (keyboardFrameRef.current) {
        applyKeyboardFrame(keyboardFrameRef.current);
      }
    });
  }, [applyKeyboardFrame]);

  const handleTargetLayout = useCallback(() => {
    requestAnimationFrame(measureTarget);
  }, [measureTarget]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;

    const updateInset = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      keyboardFrameRef.current = event.endCoordinates;
      measureTarget();
      applyKeyboardFrame(event.endCoordinates);
    };
    const resetInset = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      keyboardFrameRef.current = null;
      setKeyboardInset(0);
    };

    const changeSubscription = Keyboard.addListener("keyboardWillChangeFrame", updateInset);
    const hideSubscription = Keyboard.addListener("keyboardWillHide", resetInset);

    return () => {
      changeSubscription.remove();
      hideSubscription.remove();
    };
  }, [applyKeyboardFrame, measureTarget]);

  return {
    keyboardInset,
    keyboardInsetTargetRef: targetRef,
    onKeyboardInsetTargetLayout: handleTargetLayout,
  };
}

function WorkspaceStateScreen({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.root, styles.defaultRoot, { backgroundColor: theme.colors.background }]}>
      <View style={styles.stateContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  changesContent: {
    paddingBottom: 32,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  changesScroll: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 10,
  },
  defaultRoot: {
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    minHeight: 0,
  },
  stateContent: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  terminalContent: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  terminalRoot: {
    backgroundColor: colors.terminalBg,
  },
});
