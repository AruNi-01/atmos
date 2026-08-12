import { radii } from "@/theme/radii";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { Button, Host } from "@expo/ui";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, type NativeStackHeaderItem, useRouter } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { NativeMenuButton } from "@/ui/primitives/native-controls";
import { DownloadIcon, PlusIcon } from "@/ui/icons/lucide-native";
import { useMobileTheme } from "@/theme/theme-store";
import { buildWorkspaceProjectGroups } from "@/features/workspaces/workspace-picker-groups";
import {
  getWorkspaceWorkflowStatusColor,
  getWorkspaceWorkflowStatusMeta,
  normalizeWorkspaceWorkflowStatus,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
  type WorkspaceWorkflowStatus,
} from "@/features/workspaces/workspace-status";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

export function WorkspacePickerScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const queryClient = useQueryClient();
  const { client, state } = useMobileWs();
  const hasDeviceCredential = useSessionStore(
    (store) => store.hasDeviceCredential,
  );
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const isConnected = Boolean(client && state === "open");
  const bootstrapQueryKey = ["workspace-bootstrap", selectedServerId, state] as const;

  const bootstrap = useQuery({
    queryKey: bootstrapQueryKey,
    enabled: isConnected,
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const updateWorkflowStatus = useMutation({
    mutationFn: ({
      workflowStatus,
      workspaceId,
    }: {
      workflowStatus: WorkspaceWorkflowStatus;
      workspaceId: string;
    }) => {
      if (!client) throw new Error("Computer connection is not available.");
      return wsActions.workspaceUpdateWorkflowStatus(client, workspaceId, workflowStatus);
    },
    onMutate: async ({ workflowStatus, workspaceId }) => {
      await queryClient.cancelQueries({ queryKey: bootstrapQueryKey });
      const previous = queryClient.getQueryData<ProjectWorkspaceBootstrapResponse>(bootstrapQueryKey);
      queryClient.setQueryData<ProjectWorkspaceBootstrapResponse>(bootstrapQueryKey, (current) =>
        updateBootstrapWorkspaceStatus(current, workspaceId, workflowStatus),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(bootstrapQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
    },
  });

  const projects = bootstrap.data?.projects ?? [];
  const workspacesByProject = bootstrap.data?.workspaces_by_project ?? {};
  const groups = buildWorkspaceProjectGroups(projects, workspacesByProject);
  const workspaceCount = groups.reduce((total, group) => total + group.workspaces.length, 0);
  const projectCount = projects.length;
  const error = bootstrap.error instanceof Error ? bootstrap.error.message : null;
  const statusUpdateError = updateWorkflowStatus.error instanceof Error ? updateWorkflowStatus.error.message : null;
  const canShowWorkspaces = hasDeviceCredential && isConnected && !error;

  return (
    <>
      <AppScreen surface="sheet">
        {!hasDeviceCredential || error ? (
          <GuideSection
            actionLabel="Computer Connect"
            message={error ?? "Choose a Computer before opening Workspaces."}
            onAction={() => router.replace("/computer-connect")}
            title={!hasDeviceCredential ? "Connect first" : "Connection failed"}
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
        ) : projectCount === 0 && workspaceCount === 0 ? (
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
                {group.workspaces.length === 0 ? (
                  <View style={styles.emptyProject}>
                    <EmptyState title="No Workspaces" message="Create a workspace in this project to start working." />
                    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        label={"New Workspace"}
        onPress={() =>
                        router.replace({
                          pathname: "/create-workspace",
                          params: { projectGuid: group.project.guid },
                        })}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="filled"
      />
    </Host>
                  </View>
                ) : (
                  <View>
                    {group.workspaces.map((workspace, index) => (
                      <View key={workspace.guid}>
                        <WorkspaceRow
                          title={workspace.display_name ?? workspace.name}
                          branch={workspace.branch || "No branch"}
                          status={workspace.workflow_status}
                          onPress={() => router.replace(`/workspace/${workspace.guid}`)}
                          onStatusChange={(workflowStatus) => {
                            if (workflowStatus === normalizeWorkspaceWorkflowStatus(workspace.workflow_status)) return;
                            updateWorkflowStatus.mutate({ workspaceId: workspace.guid, workflowStatus });
                          }}
                        />
                        {index < group.workspaces.length - 1 ? <Separator /> : null}
                      </View>
                    ))}
                  </View>
                )}
              </Section>
            ))}
          </View>
        )}
        <InlineError message={error ?? statusUpdateError} />
      </AppScreen>
      <Stack.Screen
        options={{
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <View style={styles.headerActions}>
                    <HeaderIconButton
                      accessibilityLabel="New Workspace"
                      disabled={!canShowWorkspaces}
                      icon="plus"
                      onPress={() => router.replace("/create-workspace")}
                    />
                    <HeaderIconButton
                      accessibilityLabel="Import Project"
                      disabled={!canShowWorkspaces}
                      icon="download"
                      onPress={() => router.replace("/import-project")}
                    />
                  </View>
                ),
          unstable_headerRightItems:
            Platform.OS === "ios"
              ? () =>
                  buildHeaderRightItems({
                    disabled: !canShowWorkspaces,
                    onImportProject: () => router.replace("/import-project"),
                    onNewWorkspace: () => router.replace("/create-workspace"),
                    tintColor: theme.colors.label,
                  })
              : undefined,
        }}
      />
    </>
  );
}

function WorkspaceRow({
  branch,
  onPress,
  onStatusChange,
  status,
  title,
}: {
  branch: string;
  onPress: () => void;
  onStatusChange: (status: WorkspaceWorkflowStatus) => void;
  status: string;
  title: string;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.workspaceRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.workspaceOpenArea, pressed ? styles.rowPressed : null]}
      >
        <Text style={[styles.workspaceTitle, { color: theme.colors.label }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.workspaceBranch, { color: theme.colors.secondaryLabel }]} numberOfLines={1}>
          {branch}
        </Text>
      </Pressable>
      <WorkspaceStatusMenu
        status={status}
        onStatusChange={onStatusChange}
      />
    </View>
  );
}

function WorkspaceStatusMenu({
  onStatusChange,
  status,
}: {
  onStatusChange: (status: WorkspaceWorkflowStatus) => void;
  status: string;
}) {
  const theme = useMobileTheme();
  const normalizedStatus = normalizeWorkspaceWorkflowStatus(status);
  const meta = getWorkspaceWorkflowStatusMeta(normalizedStatus);
  const statusColor = getWorkspaceWorkflowStatusColor(normalizedStatus, theme.colors);
  const StatusIcon = meta.Icon;
  const actions = buildStatusMenuActions(normalizedStatus, theme.colors);

  if (Platform.OS === "ios") {
    return (
      <View style={styles.statusMenu}>
        <NativeMenuButton
          actions={actions}
          iconOnly
          label={meta.label}
          onAction={(actionId) => onStatusChange(actionId as WorkspaceWorkflowStatus)}
          systemImage={meta.menuSystemImage}
          tintColor={statusColor}
          title="Workspace status"
        />
      </View>
    );
  }

  return (
    <View style={styles.statusMenu}>
      <MenuView
        actions={actions}
        onPressAction={(event) => onStatusChange(event.nativeEvent.event as WorkspaceWorkflowStatus)}
        shouldOpenOnLongPress={false}
        title="Workspace status"
      >
        <View
          accessibilityLabel={`Workspace status: ${meta.label}`}
          accessibilityRole="button"
          style={styles.statusButtonHitbox}
        >
          <View style={styles.statusButton}>
            <StatusIcon color={statusColor} size={17} />
          </View>
        </View>
      </MenuView>
    </View>
  );
}

function buildStatusMenuActions(
  status: WorkspaceWorkflowStatus,
  themeColors: ReturnType<typeof useMobileTheme>["colors"],
): MenuAction[] {
  return WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => {
    const statusColor = getWorkspaceWorkflowStatusColor(option.value, themeColors);
    return {
      id: option.value,
      image: option.menuSystemImage,
      imageColor: statusColor,
      state: option.value === status ? "on" : "off",
      title: option.label,
    };
  });
}

function buildHeaderRightItems({
  disabled,
  onImportProject,
  onNewWorkspace,
  tintColor,
}: {
  disabled: boolean;
  onImportProject: () => void;
  onNewWorkspace: () => void;
  tintColor: string;
}): NativeStackHeaderItem[] {
  const sharedButtonProps = {
    disabled,
    sharesBackground: true,
    tintColor,
    type: "button" as const,
    variant: "plain" as const,
  };

  return [
    {
      ...sharedButtonProps,
      accessibilityLabel: "New Workspace",
      icon: sfSymbol("plus"),
      identifier: "workspace-picker-new",
      label: "New",
      onPress: onNewWorkspace,
    },
    {
      ...sharedButtonProps,
      accessibilityLabel: "Import Project",
      icon: sfSymbol("square.and.arrow.down"),
      identifier: "workspace-picker-import",
      label: "Import",
      onPress: onImportProject,
    },
  ];
}

function HeaderIconButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: "download" | "plus";
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  const Icon = icon === "plus" ? PlusIcon : DownloadIcon;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={12}
      onPress={disabled ? undefined : onPress}
      style={[styles.headerIconButton, disabled ? styles.headerIconButtonDisabled : null]}
    >
      <Icon color={theme.colors.label} size={21} strokeWidth={2.4} />
    </Pressable>
  );
}

function sfSymbol(name: SFSymbol) {
  return { name, type: "sfSymbol" as const };
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
  const theme = useMobileTheme();
  return (
    <Section>
      <View style={styles.guide}>
        <EmptyState title={title} message={message} />
        {actionLabel && onAction ? <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        label={actionLabel}
        onPress={onAction}
        modifiers={buttonStretchModifiers}
        style={{
      height: 52,
    }}
        variant="filled"
      />
    </Host> : null}
      </View>
    </Section>
  );
}

function updateBootstrapWorkspaceStatus(
  current: ProjectWorkspaceBootstrapResponse | undefined,
  workspaceId: string,
  workflowStatus: WorkspaceWorkflowStatus,
) {
  if (!current) return current;

  let changed = false;
  const workspacesByProject = Object.fromEntries(
    Object.entries(current.workspaces_by_project).map(([projectId, workspaces]) => [
      projectId,
      workspaces.map((workspace) => {
        if (workspace.guid !== workspaceId) return workspace;
        changed = true;
        return { ...workspace, workflow_status: workflowStatus };
      }),
    ]),
  );

  if (!changed) return current;
  return {
    ...current,
    workspaces_by_project: workspacesByProject,
  };
}

const styles = StyleSheet.create({
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  emptyProject: {
    gap: 12,
    padding: 16,
  },
  groups: {
    gap: 14,
  },
  guide: {
    gap: 12,
    padding: 16,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  headerIconButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headerIconButtonDisabled: {
    opacity: 0.42,
  },
  rowPressed: {
    opacity: 0.62,
  },
  statusButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  statusButtonHitbox: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  statusMenu: {
    alignSelf: "flex-end",
    marginBottom: 4,
    marginRight: 8,
  },
  workspaceBranch: {
    fontSize: 13,
    lineHeight: 19,
  },
  workspaceOpenArea: {
    flex: 1,
    paddingHorizontal: 18,
    paddingRight: 8,
    paddingVertical: 12,
  },
  workspaceRow: {
    alignItems: "stretch",
    flexDirection: "row",
    minHeight: 68,
  },
  workspaceTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 21,
    marginBottom: 4,
  },
});
