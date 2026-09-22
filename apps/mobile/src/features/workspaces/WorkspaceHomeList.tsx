import { Pressable, Text, View } from "react-native";
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
import { ChevronDownIcon, ChevronRightIcon } from "@/ui/icons/lucide-native";
import { EmptyState, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";

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
  const openWorkspace = (id: string) => router.push(`/workspace/${id}`);

  if (!isLoading && entries.length === 0) {
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
          onOpen={openWorkspace}
          onToggle={toggleRecent}
          open={recentExpanded}
          title="Recently"
        />
      ) : null}
      {sections.map((section) => (
        <WorkspaceGroup
          count={section.items.length}
          items={section.items}
          key={section.key}
          onOpen={openWorkspace}
          onToggle={() => toggleExpanded(section.key)}
          open={expanded[section.key] !== false}
          title={section.title}
        />
      ))}
    </>
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
  onOpen: (id: string) => void;
  onToggle: () => void;
  open: boolean;
  title: string;
}) {
  const theme = useMobileTheme();

  return (
    <View style={{ gap: spacing.sectionLabelGap }}>
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
            fontSize: 13,
            fontWeight: "600",
            lineHeight: 18,
          }}
        >
          {title}
        </Text>
        {count != null ? (
          <Text
            style={{
              color: theme.colors.tertiaryLabel,
              fontSize: 13,
              fontVariant: ["tabular-nums"],
              fontWeight: "600",
              lineHeight: 18,
            }}
          >
            {count}
          </Text>
        ) : null}
        {open ? (
          <ChevronDownIcon color={theme.colors.tertiaryLabel} size={16} strokeWidth={2.4} />
        ) : (
          <ChevronRightIcon color={theme.colors.tertiaryLabel} size={16} strokeWidth={2.4} />
        )}
      </Pressable>
      {open ? (
        <Section>
          {items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Separator /> : null}
              <Row onPress={() => onOpen(item.id)} title={item.title} />
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}
