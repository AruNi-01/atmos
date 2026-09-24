import { useMemo } from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { rowsInScope } from "@/features/sessions/scoped-session-rows";
import { SessionRowList } from "@/features/sessions/session-row-list";
import { useSessionInbox } from "@/features/sessions/use-session-inbox";
import { createMobileTerminalSessionId } from "@/features/terminal/terminal-selection";
import { resolveMobileTerminalHeading } from "@/features/terminal/terminal-heading";
import { useContestedCliOwners } from "@/features/terminal/use-contested-cli-owners";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { newTerminalHeaderItem } from "@/ui/navigation/terminal-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { PlusIcon } from "@/ui/icons/lucide-native";

export function WorkspaceSessionsScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const theme = useMobileTheme();
  const inbox = useSessionInbox();
  const contestedOwners = useContestedCliOwners();
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const entries = useTerminalStore((store) => store.entriesByWorkspaceId[workspaceId] ?? []);
  const addEntry = useTerminalStore((store) => store.addEntry);
  const bootstrap = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, state],
    enabled: Boolean(client && state === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const scope = useMemo(() => resolveScope(bootstrap.data, workspaceId), [bootstrap.data, workspaceId]);
  const rows = useMemo(() => {
    const scoped = rowsInScope(inbox.rows, scope.workspaceIds, scope.projectName);
    const known = new Set(scoped.flatMap((row) => [row.id, row.terminalCandidateId].filter(Boolean)));
    const local = entries
      .filter((entry) => !known.has(entry.id))
      .map((entry) => ({
        archiveSessionId: null,
        branch: null,
        bucket: "done" as const,
        id: entry.id,
        prState: null,
        projectName: null,
        projectScoped: false,
        terminalCandidateId: entry.id,
        title: resolveMobileTerminalHeading({
          baseTitle: entry.label,
          contestedOwners,
          dynamicTitle: entry.dynamicTitle,
          oscTitle: entry.oscTitle,
          sessionOscTitle: entry.sessionOscTitle,
        }).title,
        updatedAt: null,
        workspaceId: entry.workspaceId,
        workspaceName: null,
      }));
    return [...scoped, ...local];
  }, [contestedOwners, entries, inbox.rows, scope.projectName, scope.workspaceIds]);

  const openTerminal = (terminalId?: string | null, targetWorkspaceId = workspaceId) => {
    router.push({
      pathname: "/workspace/[workspaceId]/terminal",
      params: terminalId
        ? { terminal: terminalId, workspaceId: targetWorkspaceId }
        : { workspaceId: targetWorkspaceId },
    });
  };

  const createTerminal = () => {
    const id = `${workspaceId}:mobile-${Date.now()}`;
    addEntry({
      id,
      isNew: true,
      label: `Terminal ${entries.length + 1}`,
      sessionId: createMobileTerminalSessionId(workspaceId),
      workspaceId,
    });
    openTerminal(id);
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions(scope.title, theme.colors),
          headerBackButtonDisplayMode: "minimal",
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () => [newTerminalHeaderItem(createTerminal, theme.colors.label)],
              }
            : {
                headerRight: () => (
                  <Pressable accessibilityLabel="New terminal" accessibilityRole="button" hitSlop={12} onPress={createTerminal}>
                    <PlusIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
                  </Pressable>
                ),
              }),
        }}
      />
      <AppScreen>
        <Section>
          {inbox.isLoading && rows.length === 0 ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState layout="section" message="Start one with the new button." title="No sessions" />
          ) : (
            <SessionRowList
              omitPlace
              onArchive={inbox.archiveSession}
              onPress={(row) => openTerminal(row.terminalCandidateId, row.workspaceId ?? workspaceId)}
              rows={rows}
            />
          )}
        </Section>
        <InlineError message={inbox.error} />
      </AppScreen>
    </>
  );
}

function resolveScope(
  bootstrap: Awaited<ReturnType<typeof wsActions.projectWorkspaceBootstrap>> | undefined,
  workspaceId: string,
) {
  const workspaces = Object.values(bootstrap?.workspaces_by_project ?? {}).flat();
  const workspace = workspaces.find((candidate) => candidate.guid === workspaceId);
  if (workspace) {
    return {
      projectName: null as string | null,
      title: workspace.display_name?.trim() || workspace.name,
      workspaceIds: new Set([workspace.guid]),
    };
  }
  const project = bootstrap?.projects.find((candidate) => candidate.guid === workspaceId && !candidate.is_deleted);
  if (project) {
    const ids = (bootstrap?.workspaces_by_project?.[project.guid] ?? []).map((item) => item.guid);
    return {
      projectName: project.name,
      title: project.name,
      workspaceIds: new Set(ids),
    };
  }
  return {
    projectName: null as string | null,
    title: "Sessions",
    workspaceIds: new Set([workspaceId]),
  };
}
