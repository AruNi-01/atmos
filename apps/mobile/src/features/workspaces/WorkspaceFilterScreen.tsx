import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Host, Picker } from "@expo/ui";
import { Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { wsActions } from "@/api/ws-actions";
import { FilterChoiceRows } from "@/features/workspaces/WorkspaceFilterOptionsScreen";
import {
  filterChoices,
  filterSelectionLabel,
  WORKSPACE_GROUPING_OPTIONS,
  workspaceFilterKey,
  type WorkspaceFilterKind,
  type WorkspaceGrouping,
} from "@/features/workspaces/workspace-home-list";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceHomeStore } from "@/stores/workspace-home-store";
import { useMobileTheme } from "@/theme/theme-store";
import { typography } from "@/theme/typography";
import {
  BotIcon,
  ChevronRightIcon,
  Clock3Icon,
  FlagIcon,
  FolderKanbanIcon,
  FoldersIcon,
  TagsIcon,
  TimerIcon,
} from "@/ui/icons/lucide-native";
import { StatusBacklogIcon } from "@/features/workspaces/workspace-status";
import { AppScreen, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { nativeCompactTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";

const FILTER_ROWS: Array<{
  kind: WorkspaceFilterKind;
  label: string;
}> = [
  { kind: "project", label: "Project" },
  { kind: "group", label: "Group" },
  { kind: "status", label: "Status" },
  { kind: "priority", label: "Priority" },
  { kind: "label", label: "Labels" },
];

function FilterKindMark({ color, kind }: { color: string; kind: WorkspaceFilterKind }) {
  if (kind === "status") return <StatusBacklogIcon color={color} size={18} />;
  const Icon = {
    group: FoldersIcon,
    label: TagsIcon,
    priority: FlagIcon,
    project: FolderKanbanIcon,
  }[kind];
  return <Icon color={color} size={18} strokeWidth={2.2} />;
}

function GroupingMark({ color, value }: { color: string; value: WorkspaceGrouping }) {
  if (value === "status") return <StatusBacklogIcon color={color} size={18} />;
  const Icon = {
    agent: BotIcon,
    group: FoldersIcon,
    label: TagsIcon,
    priority: FlagIcon,
    project: FolderKanbanIcon,
    time: Clock3Icon,
  }[value];
  return <Icon color={color} size={18} strokeWidth={2.2} />;
}

export function WorkspaceFilterScreen() {
  const theme = useMobileTheme();
  const grouping = useWorkspaceHomeStore((state) => state.grouping);
  const setGrouping = useWorkspaceHomeStore((state) => state.setGrouping);
  const filters = useWorkspaceHomeStore((state) => state.filters);
  const toggleAutomation = useWorkspaceHomeStore((state) => state.toggleAutomation);
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const bootstrap = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, state],
    enabled: Boolean(client && state === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });
  const [sheetKind, setSheetKind] = useState<WorkspaceFilterKind | null>(null);
  const groups = bootstrap.data?.groups ?? [];
  const projects = bootstrap.data?.projects ?? [];
  const workspacesByProject = bootstrap.data?.workspaces_by_project ?? {};
  const sheetLabel = FILTER_ROWS.find((row) => row.kind === sheetKind)?.label;

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeCompactTitleOptions("Filter", theme.colors),
          headerStyle: { backgroundColor: theme.colors.sheetBackground },
        }}
      />
      <AppScreen surface="sheet">
        <Section label="Grouping">
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: 12,
              minHeight: 52,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <GroupingMark color={theme.colors.secondaryLabel} value={grouping} />
            <Text
              numberOfLines={1}
              style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}
            >
              Group by
            </Text>
            <Host colorScheme={theme.colorScheme} matchContents seedColor={theme.colors.label}>
              <Picker
                appearance="menu"
                onValueChange={(value) => setGrouping(value as WorkspaceGrouping)}
                selectedValue={grouping}
              >
                {WORKSPACE_GROUPING_OPTIONS.map((option) => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
            </Host>
          </View>
        </Section>
        <Section label="Filter">
          {FILTER_ROWS.map((row, index) => {
            const choices = filterChoices({
              groups,
              kind: row.kind,
              projects,
              workspacesByProject,
            });
            const selected = filters[workspaceFilterKey(row.kind)];
            const labels = selected
              .map((id) => choices.find((choice) => choice.id === id)?.label)
              .filter((label): label is string => Boolean(label));
            return (
              <View key={row.kind}>
                {index > 0 ? <Separator /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSheetKind(row.kind)}
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
                      paddingVertical: 10,
                    }}
                  >
                    <FilterKindMark color={theme.colors.secondaryLabel} kind={row.kind} />
                    <Text
                      numberOfLines={1}
                      style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}
                    >
                      {row.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.rowMeta,
                        { color: theme.colors.secondaryLabel, maxWidth: "42%" },
                      ]}
                    >
                      {filterSelectionLabel(labels)}
                    </Text>
                    <ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.6} />
                  </View>
                </Pressable>
              </View>
            );
          })}
          <Separator />
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: 12,
              minHeight: 52,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <TimerIcon color={theme.colors.secondaryLabel} size={18} strokeWidth={2.2} />
            <Text style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}>
              Automation workspace
            </Text>
            <Switch
              onValueChange={(isOn) => {
                if (isOn !== filters.showAutomation) toggleAutomation();
              }}
              thumbColor={theme.colors.labelInverse}
              trackColor={{ false: theme.colors.controlSecondary, true: theme.colors.label }}
              value={filters.showAutomation}
            />
          </View>
        </Section>
      </AppScreen>
      <ExpoDrawer
        isPresented={sheetKind != null}
        matchContents={false}
        onDismiss={() => setSheetKind(null)}
      >
        {sheetKind ? (
          <View style={{ alignSelf: "stretch", flex: 1, justifyContent: "flex-start", paddingTop: 20 }}>
            <Text
              style={[
                typography.rowTitle,
                {
                  color: theme.colors.label,
                  fontSize: 22,
                  lineHeight: 28,
                  marginBottom: 16,
                },
              ]}
            >
              {sheetLabel}
            </Text>
            <ScrollView
              contentContainerStyle={{ flexGrow: 0 }}
              showsVerticalScrollIndicator={false}
              style={{
                alignSelf: "stretch",
                backgroundColor: theme.colors.cardElevated,
                borderColor: theme.colors.glassBorder,
                borderCurve: "continuous",
                borderRadius: 24,
                borderWidth: StyleSheet.hairlineWidth,
                flexGrow: 0,
                flexShrink: 1,
                overflow: "hidden",
              }}
            >
              <FilterChoiceRows
                groups={groups}
                kind={sheetKind}
                projects={projects}
                workspacesByProject={workspacesByProject}
              />
            </ScrollView>
          </View>
        ) : null}
      </ExpoDrawer>
    </>
  );
}
