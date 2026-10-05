import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing as RnEasing, Pressable, Text, View } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { GroupModel, ProjectModel, ProjectWorkspaceBootstrapResponse, WorkspaceModel } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import {
  groupWorkspaceEntries,
  recentWorkspaceEntries,
  visibleWorkspaceEntries,
  type WorkspaceHomeEntry,
} from "@/features/workspaces/workspace-home-list";
import { useWorkspaceHomeStore } from "@/stores/workspace-home-store";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { EmptyState, Section } from "@/ui/layout/app-screen";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { SessionSwipeRow } from "@/ui/primitives/session-swipe-row";
import { Row, Separator } from "@/ui/layout/row";

const SECTION_TITLE_SIZE = 17;
const SECTION_CHEVRON_SIZE = 20;
const SECTION_MOTION_MS = 220;

export function WorkspaceHomeList({
  groups,
  isLoading = false,
  projects,
  workspacesByProject,
}: {
  groups: GroupModel[];
  isLoading?: boolean;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}) {
  const router = useRouter();
  const theme = useMobileTheme();
  const grouping = useWorkspaceHomeStore((state) => state.grouping);
  const filters = useWorkspaceHomeStore((state) => state.filters);
  const expanded = useWorkspaceHomeStore((state) => state.expanded);
  const toggleExpanded = useWorkspaceHomeStore((state) => state.toggleExpanded);
  const recentExpanded = useWorkspaceHomeStore((state) => state.recentExpanded);
  const toggleRecent = useWorkspaceHomeStore((state) => state.toggleRecent);
  const actions = useWorkspaceRowActions();
  const [deleteEntry, setDeleteEntry] = useState<WorkspaceHomeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const entries = visibleWorkspaceEntries({ filters, groups, projects, workspacesByProject });
  const pinnedEntries = entries.filter((entry) => entry.kind === "workspace" && entry.pinned);
  const pinnedIds = new Set(pinnedEntries.map((entry) => entry.id));
  const recent = recentWorkspaceEntries({ entries, workspacesByProject }).filter(
    (entry) => !pinnedIds.has(entry.id),
  );
  const sections = groupWorkspaceEntries({
    entries,
    grouping,
    groups,
    projects,
    workspacesByProject,
  })
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.kind === "project" || !pinnedIds.has(item.id)),
    }))
    .filter((section) => section.items.some((item) => item.kind === "workspace"));
  const openEntry = (entry: WorkspaceHomeEntry) => router.push(`/workspace/${entry.id}`);
  const rowActions = {
    onArchive: (entry: WorkspaceHomeEntry) => {
      setActionError(null);
      void actions.archive(entry.id).catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : "Could not archive this workspace.");
      });
    },
    onDelete: (entry: WorkspaceHomeEntry) => setDeleteEntry(entry),
    onTogglePin: (entry: WorkspaceHomeEntry) => {
      setActionError(null);
      void actions.togglePin(entry.id, entry.pinned).catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : "Could not pin this workspace.");
      });
    },
    surfaceColor: theme.colors.cardElevated,
  };

  if (isLoading && entries.length === 0) {
    return (
      <Section>
        <ListSkeleton />
      </Section>
    );
  }

  if (entries.length === 0) {
    return (
      <Section>
        <EmptyState layout="section" message="No workspaces yet." title="No workspaces" />
      </Section>
    );
  }

  return (
    <>
      {actionError ? (
        <Text style={{ color: theme.colors.red, fontSize: 13, paddingHorizontal: spacing.sectionLabelX }}>
          {actionError}
        </Text>
      ) : null}
      {pinnedEntries.length > 0 ? (
        <WorkspaceGroup
          items={pinnedEntries}
          onOpen={openEntry}
          onToggle={() => undefined}
          open
          title="Pinned"
          {...rowActions}
        />
      ) : null}
      {recent.length > 0 ? (
        <WorkspaceGroup
          items={recent}
          onOpen={openEntry}
          onToggle={toggleRecent}
          open={recentExpanded}
          title="Recently"
          {...rowActions}
        />
      ) : null}
      {sections.map((section) => {
        const workspaceCount = section.items.filter((item) => item.kind === "workspace").length;
        return (
          <WorkspaceGroup
            count={workspaceCount > 0 ? workspaceCount : undefined}
            items={section.items}
            key={section.key}
            onOpen={openEntry}
            onToggle={() => toggleExpanded(section.key)}
            open={expanded[section.key] !== false}
            title={section.title}
            {...rowActions}
          />
        );
      })}
      <ExpoDrawer
        isPresented={deleteEntry != null}
        matchContents
        onDismiss={() => {
          if (!deleting) setDeleteEntry(null);
        }}
        snapPoints={[{ height: 220 }]}
      >
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>
            Delete workspace
          </Text>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}>
            {deleteEntry ? `${deleteEntry.title} leaves this list.` : ""}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={() => {
              const entry = deleteEntry;
              if (!entry) return;
              setDeleting(true);
              setActionError(null);
              void actions
                .remove(entry.id)
                .then(() => setDeleteEntry(null))
                .catch((error: unknown) => {
                  setActionError(error instanceof Error ? error.message : "Could not delete this workspace.");
                })
                .finally(() => setDeleting(false));
            }}
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.red,
              borderRadius: 16,
              opacity: deleting ? 0.6 : 1,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}>Delete</Text>
          </Pressable>
        </View>
      </ExpoDrawer>
    </>
  );
}

function CollapsibleRows({ children, open }: { children: ReactNode; open: boolean }) {
  const reducedMotion = useReducedMotion() === true;
  const progress = useSharedValue(open ? 1 : 0);
  const target = useSharedValue(open ? 1 : 0);
  const contentHeight = useSharedValue(0);
  // Clip only while the height is moving or the section is closed. An open
  // section stays in normal flow: a clipped, absolutely positioned wrapper
  // swallows the row swipe gesture.
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      progress.set(open ? 1 : 0);
      setClipping(false);
      return;
    }
    if (!open) {
      setClipping(true);
      return;
    }
    if (contentHeight.get() <= 0) {
      progress.set(1);
      setClipping(false);
      return;
    }
    setClipping(true);
  }, [contentHeight, open, progress, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !clipping) return;
    const next = open ? 1 : 0;
    target.set(next);
    progress.set(
      withTiming(next, { duration: SECTION_MOTION_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && target.get() === 1) scheduleOnRN(setClipping, false);
      }),
    );
  }, [clipping, open, progress, reducedMotion, target]);

  const clipStyle = useAnimatedStyle(() => ({
    height: contentHeight.get() * progress.get(),
    overflow: "hidden" as const,
  }));

  if (reducedMotion) {
    if (!open) return null;
    return <View>{children}</View>;
  }

  return (
    <Reanimated.View
      accessibilityElementsHidden={!open}
      collapsable={false}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      pointerEvents={open ? "auto" : "none"}
      style={clipping ? clipStyle : undefined}
    >
      <View
        collapsable={false}
        onLayout={(event) => {
          if (clipping) return;
          const next = event.nativeEvent.layout.height;
          if (next < 1 || Math.abs(contentHeight.get() - next) < 1) return;
          contentHeight.set(next);
        }}
        style={clipping ? { left: 0, position: "absolute", right: 0, top: 0 } : undefined}
      >
        {children}
      </View>
    </Reanimated.View>
  );
}

function WorkspaceGroup({
  count,
  items,
  onArchive,
  onDelete,
  onOpen,
  onToggle,
  onTogglePin,
  open,
  surfaceColor,
  title,
}: {
  count?: number;
  items: WorkspaceHomeEntry[];
  onArchive: (entry: WorkspaceHomeEntry) => void;
  onDelete: (entry: WorkspaceHomeEntry) => void;
  onOpen: (entry: WorkspaceHomeEntry) => void;
  onToggle: () => void;
  onTogglePin: (entry: WorkspaceHomeEntry) => void;
  open: boolean;
  surfaceColor: string;
  title: string;
}) {
  const theme = useMobileTheme();
  const reducedMotion = useReducedMotion() === true;
  const rotation = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      rotation.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(rotation, {
      duration: SECTION_MOTION_MS,
      easing: RnEasing.out(RnEasing.cubic),
      toValue: open ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [open, reducedMotion, rotation]);

  const chevronRotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["-90deg", "0deg"],
  });

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: spacing.sectionLabelX,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.secondaryLabel,
            flex: 1,
            fontSize: SECTION_TITLE_SIZE,
            fontWeight: "600",
            lineHeight: 22,
          }}
        >
          {title}
        </Text>
        {count != null ? (
          <Text
            style={{
              color: theme.colors.tertiaryLabel,
              fontSize: 15,
              fontVariant: ["tabular-nums"],
              fontWeight: "600",
              lineHeight: 20,
            }}
          >
            {count}
          </Text>
        ) : null}
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDownIcon color={theme.colors.tertiaryLabel} size={SECTION_CHEVRON_SIZE} strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
      <CollapsibleRows open={open}>
        <View style={{ paddingTop: spacing.sectionLabelGap }}>
          <Section>
            {items.map((item, index) => {
              const row = (
                <Row
                  onPress={() => onOpen(item)}
                  subtitle={item.kind === "project" ? "Project" : undefined}
                  title={item.title}
                />
              );
              return (
                <View key={`${item.kind}:${item.id}`}>
                  {index > 0 ? <Separator /> : null}
                  {item.kind === "workspace" ? (
                    <SessionSwipeRow
                      backgroundColor={surfaceColor}
                      onArchive={() => onArchive(item)}
                      onDelete={() => onDelete(item)}
                      onPin={() => onTogglePin(item)}
                      pinLabel={item.pinned ? "Unpin" : "Pin"}
                    >
                      {row}
                    </SessionSwipeRow>
                  ) : (
                    row
                  )}
                </View>
              );
            })}
          </Section>
        </View>
      </CollapsibleRows>
    </View>
  );
}

function useWorkspaceRowActions() {
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const queryClient = useQueryClient();
  const queryKey = ["workspace-bootstrap", selectedServerId, state] as const;

  const patch = (workspaceId: string, update: Partial<WorkspaceModel>) => {
    queryClient.setQueryData<ProjectWorkspaceBootstrapResponse>(queryKey, (current) => {
      if (!current) return current;
      const workspacesByProject = { ...current.workspaces_by_project };
      for (const [projectId, workspaces] of Object.entries(workspacesByProject)) {
        workspacesByProject[projectId] = workspaces.map((workspace) =>
          workspace.guid === workspaceId ? { ...workspace, ...update } : workspace,
        );
      }
      return { ...current, workspaces_by_project: workspacesByProject };
    });
  };

  return {
    archive: async (workspaceId: string) => {
      if (!client || state !== "open") return;
      patch(workspaceId, { is_archived: true });
      try {
        await wsActions.workspaceArchive(client, workspaceId);
      } catch (error) {
        patch(workspaceId, { is_archived: false });
        throw error;
      }
    },
    remove: async (workspaceId: string) => {
      if (!client || state !== "open") return;
      patch(workspaceId, { is_deleted: true });
      try {
        await wsActions.workspaceDelete(client, workspaceId);
      } catch (error) {
        patch(workspaceId, { is_deleted: false });
        throw error;
      }
    },
    togglePin: async (workspaceId: string, pinned: boolean) => {
      if (!client || state !== "open") return;
      patch(workspaceId, { is_pinned: !pinned });
      try {
        await wsActions.workspaceSetPinned(client, workspaceId, !pinned);
      } catch (error) {
        patch(workspaceId, { is_pinned: pinned });
        throw error;
      }
    },
  };
}
