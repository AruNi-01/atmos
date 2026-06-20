import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { ProjectModel, WorkspaceModel } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";

export function WorkspacePickerScreen() {
  const router = useRouter();
  const { client, state } = useMobileWs();
  const hasAccessToken = useSessionStore((store) => store.hasAccessToken);
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const isConnected = Boolean(client && state === "open");

  const bootstrap = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, state],
    enabled: isConnected,
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const projects = bootstrap.data?.projects ?? [];
  const workspacesByProject = bootstrap.data?.workspaces_by_project ?? {};
  const groups = buildProjectGroups(projects, workspacesByProject);
  const workspaceCount = groups.reduce((total, group) => total + group.workspaces.length, 0);
  const error = bootstrap.error instanceof Error ? bootstrap.error.message : null;
  const canShowWorkspaces = hasAccessToken && isConnected && !error;

  return (
    <>
      <AppScreen>
        {!hasAccessToken || error ? (
          <GuideSection
            actionLabel="Computer Connect"
            message={error ?? "Choose a Computer before opening Workspaces."}
            onAction={() => router.replace("/computer-connect")}
            title={!hasAccessToken ? "Connect first" : "Connection failed"}
          />
        ) : !isConnected ? (
          <GuideSection
            actionLabel="Computer Connect"
            message="Workspace data loads from the selected Computer."
            onAction={() => router.replace("/computer-connect")}
            title={state === "reconnecting" ? "Reconnecting" : "Computer offline"}
          />
        ) : bootstrap.isLoading ? (
          <GuideSection title="Loading" message="Fetching Workspaces." />
        ) : workspaceCount === 0 ? (
          <GuideSection
            actionLabel="New Workspace"
            message="Create a workspace or import a project."
            onAction={() => router.replace("/create-workspace")}
            title="No Workspaces"
          />
        ) : (
          <View style={styles.groups}>
            {groups.map((group) => (
              <Section key={group.project.guid} label={group.project.name}>
                <View style={styles.groupRows}>
                  {group.workspaces.map((workspace) => (
                    <WorkspaceRow
                      key={workspace.guid}
                      workspace={workspace}
                      onPress={() => router.replace(`/workspace/${workspace.guid}`)}
                    />
                  ))}
                </View>
              </Section>
            ))}
          </View>
        )}
        <InlineError message={error} />
      </AppScreen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <NativeButton
                disabled={!canShowWorkspaces}
                label="New"
                onPress={() => router.replace("/create-workspace")}
                variant="text"
              />
              <NativeButton
                disabled={!canShowWorkspaces}
                label="Import"
                onPress={() => router.replace("/import-project")}
                variant="text"
              />
            </View>
          ),
        }}
      />
    </>
  );
}

function GuideSection({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <Section>
      <View style={styles.guide}>
        <EmptyState title={title} message={message} />
        {actionLabel && onAction ? <NativeButton label={actionLabel} onPress={onAction} /> : null}
      </View>
    </Section>
  );
}

function WorkspaceRow({ onPress, workspace }: { onPress: () => void; workspace: WorkspaceModel }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.workspaceRowPressed]}>
      <View style={styles.workspaceRow}>
        <View style={styles.workspaceText}>
          <Text style={styles.workspaceTitle} numberOfLines={1}>
            {workspace.display_name ?? workspace.name}
          </Text>
          <Text style={styles.workspaceMeta} numberOfLines={1}>
            {workspace.branch || "No branch"}
          </Text>
        </View>
        <NativeButton label="Open" onPress={onPress} />
      </View>
    </Pressable>
  );
}

function buildProjectGroups(projects: ProjectModel[], workspacesByProject: Record<string, WorkspaceModel[]>) {
  const projectById = new Map(projects.map((project) => [project.guid, project]));
  const groups = projects
    .map((project) => ({
      project,
      workspaces: workspacesByProject[project.guid] ?? [],
    }))
    .filter((group) => group.workspaces.length > 0);

  const orphanedWorkspaces = Object.entries(workspacesByProject)
    .filter(([projectId]) => !projectById.has(projectId))
    .flatMap(([, workspaces]) => workspaces);

  if (orphanedWorkspaces.length > 0) {
    groups.push({
      project: {
        border_color: null,
        created_at: "",
        guid: "__other__",
        is_deleted: false,
        main_file_path: "",
        name: "Other",
        sidebar_order: Number.MAX_SAFE_INTEGER,
        updated_at: "",
      },
      workspaces: orphanedWorkspaces,
    });
  }

  return groups;
}

const styles = StyleSheet.create({
  groups: {
    gap: 14,
  },
  groupRows: {
    gap: 10,
    padding: 12,
  },
  guide: {
    gap: 12,
    padding: 16,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  workspaceMeta: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  workspaceRow: {
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    padding: 12,
  },
  workspaceRowPressed: {
    opacity: 0.68,
  },
  workspaceText: {
    flex: 1,
  },
  workspaceTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "800",
  },
});
