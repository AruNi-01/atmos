import { Pressable, Text, View } from "react-native";
import type { GroupModel, ProjectModel, WorkspaceModel } from "@/api/types";
import {
  filterChoices,
  workspaceFilterKey,
  type WorkspaceFilterKind,
} from "@/features/workspaces/workspace-home-list";
import { WorkspacePriorityIcon } from "@/features/workspaces/workspace-priority-icon";
import {
  getWorkspaceWorkflowStatusColor,
  getWorkspaceWorkflowStatusMeta,
} from "@/features/workspaces/workspace-status";
import { useWorkspaceHomeStore } from "@/stores/workspace-home-store";
import { useMobileTheme } from "@/theme/theme-store";
import { typography } from "@/theme/typography";
import { CheckIcon, FoldersIcon } from "@/ui/icons/lucide-native";
import { EmptyState } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";

export function FilterChoiceRows({
  groups,
  kind,
  projects,
  workspacesByProject,
}: {
  groups: GroupModel[];
  kind: WorkspaceFilterKind;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}) {
  const theme = useMobileTheme();
  const filters = useWorkspaceHomeStore((store) => store.filters);
  const toggleFilter = useWorkspaceHomeStore((store) => store.toggleFilter);
  const choices = filterChoices({ groups, kind, projects, workspacesByProject });
  const selectedIds = filters[workspaceFilterKey(kind)];

  if (choices.length === 0) {
    return <EmptyState layout="section" message="Nothing to filter yet." title="None" />;
  }

  return (
    <>
      {choices.map((choice, index) => {
        const on = selectedIds.includes(choice.id);
        return (
          <View key={choice.id}>
            {index > 0 ? <Separator /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => toggleFilter(workspaceFilterKey(kind), choice.id)}
              style={({ pressed }) =>
                pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
              }
            >
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 12,
                  minHeight: 52,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <ChoiceMark
                  id={choice.id}
                  kind={kind}
                  projects={projects}
                  workspacesByProject={workspacesByProject}
                />
                <Text
                  numberOfLines={1}
                  style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}
                >
                  {choice.label}
                </Text>
                {on ? <CheckIcon color={theme.colors.accent} size={18} strokeWidth={2.6} /> : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

function ChoiceMark({
  id,
  kind,
  projects,
  workspacesByProject,
}: {
  id: string;
  kind: WorkspaceFilterKind;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}) {
  const theme = useMobileTheme();

  if (kind === "status") {
    const meta = getWorkspaceWorkflowStatusMeta(id);
    return <meta.Icon color={getWorkspaceWorkflowStatusColor(meta.value, theme.colors)} size={18} />;
  }
  if (kind === "priority") {
    return <WorkspacePriorityIcon mutedColor={theme.colors.secondaryLabel} priority={id} size={16} />;
  }
  if (kind === "group") {
    return <FoldersIcon color={theme.colors.secondaryLabel} size={18} strokeWidth={2.2} />;
  }

  const color =
    kind === "project"
      ? projects.find((project) => project.guid === id)?.border_color
      : labelColor(workspacesByProject, id);

  return (
    <View
      style={{
        backgroundColor: swatchColor(color, theme.colors.secondaryLabel),
        borderRadius: 4,
        height: 8,
        width: 8,
      }}
    />
  );
}

function labelColor(workspacesByProject: Record<string, WorkspaceModel[]>, id: string) {
  for (const workspaces of Object.values(workspacesByProject)) {
    for (const workspace of workspaces) {
      const match = workspace.labels.find((label) => label.guid === id);
      if (match) return match.color;
    }
  }
  return null;
}

function swatchColor(color: string | null | undefined, fallback: string) {
  const trimmed = color?.trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
