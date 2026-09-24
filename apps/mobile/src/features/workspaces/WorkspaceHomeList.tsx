import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { GroupModel, ProjectModel, WorkspaceModel } from "@/api/types";
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
  const grouping = useWorkspaceHomeStore((state) => state.grouping);
  const filters = useWorkspaceHomeStore((state) => state.filters);
  const expanded = useWorkspaceHomeStore((state) => state.expanded);
  const toggleExpanded = useWorkspaceHomeStore((state) => state.toggleExpanded);
  const recentExpanded = useWorkspaceHomeStore((state) => state.recentExpanded);
  const toggleRecent = useWorkspaceHomeStore((state) => state.toggleRecent);
  const entries = visibleWorkspaceEntries({ filters, groups, projects, workspacesByProject });
  const recent = recentWorkspaceEntries({ entries, workspacesByProject });
  const sections = groupWorkspaceEntries({
    entries,
    grouping,
    groups,
    projects,
    workspacesByProject,
  });
  const openEntry = (entry: WorkspaceHomeEntry) => router.push(`/workspace/${entry.id}`);

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
      {recent.length > 0 ? (
        <WorkspaceGroup
          items={recent}
          onOpen={openEntry}
          onToggle={toggleRecent}
          open={recentExpanded}
          title="Recently"
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
          />
        );
      })}
    </>
  );
}

function CollapsibleRows({ children, open }: { children: ReactNode; open: boolean }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = useState(0);
  const measured = contentHeight > 0;

  useEffect(() => {
    Animated.timing(progress, {
      duration: SECTION_MOTION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: open ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const height = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight],
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!open}
      collapsable={false}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      pointerEvents={open ? "auto" : "none"}
      style={measured ? { height, overflow: "hidden" } : open ? undefined : { height: 0, overflow: "hidden" }}
    >
      <View
        collapsable={false}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          if (next < 1) return;
          setContentHeight((current) => (Math.abs(current - next) < 1 ? current : next));
        }}
        style={measured || !open ? { left: 0, position: "absolute", right: 0, top: 0 } : undefined}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function WorkspaceGroup({
  count,
  items,
  onOpen,
  onToggle,
  open,
  title,
}: {
  count?: number;
  items: WorkspaceHomeEntry[];
  onOpen: (entry: WorkspaceHomeEntry) => void;
  onToggle: () => void;
  open: boolean;
  title: string;
}) {
  const theme = useMobileTheme();
  const rotation = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      duration: SECTION_MOTION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: open ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [open, rotation]);

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
            {items.map((item, index) => (
              <View key={`${item.kind}:${item.id}`}>
                {index > 0 ? <Separator /> : null}
                <Row
                  onPress={() => onOpen(item)}
                  subtitle={item.kind === "project" ? "Project" : undefined}
                  title={item.title}
                />
              </View>
            ))}
          </Section>
        </View>
      </CollapsibleRows>
    </View>
  );
}
