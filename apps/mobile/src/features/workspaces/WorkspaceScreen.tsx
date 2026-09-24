import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type KeyboardEvent,
} from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions, nativeTerminalTitleOptions } from "@/ui/navigation/native-screen-options";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import { TerminalHeadingTitle } from "@/features/terminal/TerminalHeadingTitle";
import {
  TerminalScreen,
  type TerminalHeaderActions,
  type TerminalHeading,
  type TerminalKeyboardHandler,
  type TerminalShortcutHandler,
} from "@/features/terminal/TerminalScreen";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useRecentWorkspacesStore } from "@/stores/recent-workspaces-store";
import { useSessionStore } from "@/stores/session-store";
import { wsActions } from "@/api/ws-actions";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { LayoutGridIcon, PlusIcon } from "@/ui/icons/lucide-native";
import { terminalHeaderRightItems } from "@/ui/navigation/terminal-header-items";

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const theme = useMobileTheme();
  const { client, state } = useMobileWs();
  const recordWorkspaceVisit = useRecentWorkspacesStore((store) => store.recordWorkspaceVisit);
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const [terminalKeyboardHandler, setTerminalKeyboardHandler] = useState<TerminalKeyboardHandler | null>(null);
  const [terminalShortcutHandler, setTerminalShortcutHandler] = useState<TerminalShortcutHandler | null>(null);
  const [heading, setHeading] = useState<TerminalHeading>({ title: "Terminal" });
  const headerActionsRef = useRef<TerminalHeaderActions | null>(null);
  const { keyboardInset, onKeyboardInsetTargetLayout, keyboardInsetTargetRef } = useKeyboardInset();

  const handleTerminalKeyboardHandlerChange = useCallback((handler: TerminalKeyboardHandler | null) => {
    setTerminalKeyboardHandler(() => handler);
  }, []);

  const handleTerminalShortcutHandlerChange = useCallback((handler: TerminalShortcutHandler | null) => {
    setTerminalShortcutHandler(() => handler);
  }, []);

  const handleDisplayTitleChange = useCallback((next: TerminalHeading) => {
    setHeading((current) =>
      current.title === next.title && current.agentId === next.agentId ? current : next,
    );
  }, []);

  const handleHeaderActionsChange = useCallback((actions: TerminalHeaderActions | null) => {
    headerActionsRef.current = actions;
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

  const openedProject = useMemo(() => {
    if (workspace) return null;
    return bootstrap.data?.projects.find((candidate) => candidate.guid === workspaceId && !candidate.is_deleted) ?? null;
  }, [bootstrap.data, workspace, workspaceId]);

  const project = useMemo(() => {
    if (openedProject) return openedProject;
    if (!workspace) return null;
    return bootstrap.data?.projects.find((candidate) => candidate.guid === workspace.project_guid) ?? null;
  }, [bootstrap.data, openedProject, workspace]);

  useEffect(() => {
    if (!workspace) return;
    recordWorkspaceVisit({ project, serverId: selectedServerId, workspace });
  }, [project, recordWorkspaceVisit, selectedServerId, workspace]);

  const developmentContext = workspace
    ? {
        id: workspace.guid,
        projectName: project?.name ?? null,
        title: workspace.display_name ?? workspace.name,
      }
    : openedProject
      ? {
          id: openedProject.guid,
          projectName: openedProject.name,
          title: openedProject.name,
        }
      : null;

  if (!developmentContext && bootstrap.isLoading) {
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

  if (!developmentContext) {
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

  return (
    <>
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          ...nativeTerminalTitleOptions(heading.title, theme.colors),
          headerTitle: () => <TerminalHeadingTitle agentId={heading.agentId} title={heading.title} />,
          contentStyle: {
            backgroundColor: theme.colors.terminalBg,
          },
          headerBackButtonDisplayMode: "minimal",
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () =>
                  terminalHeaderRightItems(
                    () => headerActionsRef.current?.createTerminal(),
                    () => headerActionsRef.current?.openTerminalList(),
                    theme.colors.terminalFg,
                  ),
              }
            : {
                headerRight: () => (
                  <View style={styles.headerActions}>
                    <Pressable
                      accessibilityLabel="New terminal"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => headerActionsRef.current?.createTerminal()}
                    >
                      <PlusIcon color={theme.colors.terminalFg} size={22} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Terminal list"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => headerActionsRef.current?.openTerminalList()}
                    >
                      <LayoutGridIcon color={theme.colors.terminalFg} size={22} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                ),
              }),
        }}
      />
      <View
        ref={keyboardInsetTargetRef}
        collapsable={false}
        onLayout={onKeyboardInsetTargetLayout}
        style={[styles.root, styles.terminalRoot, { backgroundColor: theme.colors.terminalBg, paddingBottom: keyboardInset }]}
      >
        <View style={styles.terminalContent}>
          <TerminalScreen
            onDisplayTitleChange={handleDisplayTitleChange}
            onHeaderActionsChange={handleHeaderActionsChange}
            onKeyboardHandlerChange={handleTerminalKeyboardHandlerChange}
            onShortcutHandlerChange={handleTerminalShortcutHandlerChange}
            projectName={developmentContext.projectName}
            workspaceId={developmentContext.id}
            workspaceName={developmentContext.title}
          />
        </View>
        {terminalShortcutHandler ? (
          <TerminalShortcutBar
            enabled
            onToggleKeyboard={terminalKeyboardHandler ?? undefined}
            onShortcut={terminalShortcutHandler}
          />
        ) : null}
      </View>
    </>
  );
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
  defaultRoot: {
    backgroundColor: colors.background,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
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
