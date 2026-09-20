import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, InlineError } from "@/ui/layout/app-screen";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { TerminalShortcutBar } from "@/features/terminal/TerminalShortcutBar";
import {
  TerminalScreen,
  type TerminalKeyboardDismissHandler,
  type TerminalShortcutHandler,
  type TerminalWorkspaceChoice,
} from "@/features/terminal/TerminalScreen";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useRecentWorkspacesStore } from "@/stores/recent-workspaces-store";
import { useSessionStore } from "@/stores/session-store";
import { wsActions } from "@/api/ws-actions";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const theme = useMobileTheme();
  const router = useRouter();
  const { client, state } = useMobileWs();
  const recordWorkspaceVisit = useRecentWorkspacesStore((store) => store.recordWorkspaceVisit);
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
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

  const workspaceChoices = useMemo<TerminalWorkspaceChoice[]>(() => {
    return Object.values(bootstrap.data?.workspaces_by_project ?? {})
      .flat()
      .map((candidate) => ({
        id: candidate.guid,
        name: candidate.display_name ?? candidate.name,
      }));
  }, [bootstrap.data]);

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

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions(workspaceTitle, theme.colors),
          contentStyle: {
            backgroundColor: theme.colors.terminalBg,
          },
          headerBackButtonDisplayMode: "minimal",
          headerRight: undefined,
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
            onKeyboardDismissHandlerChange={handleTerminalKeyboardDismissHandlerChange}
            onShortcutHandlerChange={handleTerminalShortcutHandlerChange}
            onSelectWorkspace={(nextWorkspaceId) => {
              if (nextWorkspaceId === workspaceId) return;
              router.replace(`/workspace/${nextWorkspaceId}`);
            }}
            projectName={project?.name ?? null}
            workspaceId={workspace.guid}
            workspaceName={workspaceTitle}
            workspaces={workspaceChoices}
          />
        </View>
        {terminalShortcutHandler ? (
          <TerminalShortcutBar
            enabled
            onDismissKeyboard={terminalKeyboardDismissHandler ?? undefined}
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
