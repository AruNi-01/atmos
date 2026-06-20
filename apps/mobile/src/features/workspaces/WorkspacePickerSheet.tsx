import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ProjectModel, WorkspaceModel } from "@/api/types";
import { NativeBottomSheet, NativeButton } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";

export function WorkspacePickerSheet({
  error,
  hasAccessToken,
  isLoading,
  isPresented,
  onCreateWorkspace,
  onDismiss,
  onImportProject,
  onOpenComputerConnect,
  onOpenWorkspace,
  projects,
  workspacesByProject,
  wsState,
}: {
  error?: string | null;
  hasAccessToken: boolean;
  isLoading?: boolean;
  isPresented: boolean;
  onCreateWorkspace: () => void;
  onDismiss: () => void;
  onImportProject: () => void;
  onOpenComputerConnect: () => void;
  onOpenWorkspace: (workspaceId: string) => void;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
  wsState: string;
}) {
  const groups = buildProjectGroups(projects, workspacesByProject);
  const workspaceCount = groups.reduce((total, group) => total + group.workspaces.length, 0);
  const canShowWorkspaces = hasAccessToken && wsState === "open" && !error;

  return (
    <NativeBottomSheet isPresented={isPresented} onDismiss={onDismiss} snapPoints={["full"]} testID="workspace-picker-sheet">
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Workspace</Text>
            <Text style={styles.subtitle}>{workspacePickerSubtitle(hasAccessToken, wsState, workspaceCount)}</Text>
          </View>
          <View style={styles.headerActions}>
            <NativeButton label="New" onPress={onCreateWorkspace} disabled={!canShowWorkspaces} />
            <NativeButton label="Import" onPress={onImportProject} disabled={!canShowWorkspaces} />
          </View>
        </View>

        {!hasAccessToken || error ? (
          <GuideState
            title={!hasAccessToken ? "Connect first" : "Connection failed"}
            message={error ?? "Choose a Computer before opening Workspaces."}
            actionLabel="Computer Connect"
            onAction={onOpenComputerConnect}
          />
        ) : wsState !== "open" ? (
          <GuideState
            title={wsState === "reconnecting" ? "Reconnecting" : "Computer offline"}
            message="Workspace data loads from the selected Computer."
            actionLabel="Computer Connect"
            onAction={onOpenComputerConnect}
          />
        ) : isLoading ? (
          <GuideState title="Loading" message="Fetching Workspaces." />
        ) : workspaceCount === 0 ? (
          <GuideState
            title="No Workspaces"
            message="Create a workspace or import a project."
            actionLabel="New Workspace"
            onAction={onCreateWorkspace}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.groups} keyboardShouldPersistTaps="handled">
            {groups.map((group) => (
              <View key={group.project.guid} style={styles.group}>
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {group.project.name}
                </Text>
                <View style={styles.groupRows}>
                  {group.workspaces.map((workspace) => (
                    <WorkspaceRow
                      key={workspace.guid}
                      workspace={workspace}
                      onPress={() => onOpenWorkspace(workspace.guid)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </NativeBottomSheet>
  );
}

function GuideState({
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
    <View style={styles.guide}>
      <Text selectable style={styles.guideTitle}>
        {title}
      </Text>
      <Text selectable style={styles.guideText}>
        {message}
      </Text>
      {actionLabel && onAction ? <NativeButton label={actionLabel} onPress={onAction} /> : null}
    </View>
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

function workspacePickerSubtitle(hasAccessToken: boolean, wsState: string, workspaceCount: number) {
  if (!hasAccessToken) return "Token required";
  if (wsState !== "open") return "Computer required";
  return `${workspaceCount} Workspaces`;
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    gap: 16,
    paddingBottom: 20,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: colors.label,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  guide: {
    borderColor: colors.separatorStrong,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 16,
  },
  guideText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  guideTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "800",
  },
  groups: {
    gap: 18,
    paddingBottom: 40,
  },
  group: {
    gap: 8,
  },
  groupRows: {
    gap: 10,
  },
  groupTitle: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
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
