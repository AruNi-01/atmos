import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ProjectModel, WorkspaceModel } from "@/api/types";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function WorkspaceOverview({
  project,
  workspace,
}: {
  project: ProjectModel | null;
  workspace: WorkspaceModel;
}) {
  const theme = useMobileTheme();

  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never">
      <View
        style={[styles.panel, { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.glassBorder }]}
      >
        <InfoRow label="Workspace" value={workspace.display_name ?? workspace.name} />
        <InfoRow label="Project" value={project?.name ?? "Unknown"} />
        <InfoRow label="Branch" value={workspace.branch || "None"} />
        <InfoRow label="Path" value={workspace.local_path} selectable />
      </View>

      <View
        style={[styles.panel, { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.glassBorder }]}
      >
        <InfoRow label="Status" value={workspace.workflow_status} />
        <InfoRow label="Priority" value={workspace.priority} />
        <InfoRow label="Base" value={workspace.base_branch || "None"} />
        <InfoRow label="Source" value={workspace.create_source} />
      </View>

      {workspace.github_issue || workspace.github_pr || workspace.labels.length > 0 ? (
        <View
          style={[styles.panel, { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.glassBorder }]}
        >
          {workspace.github_issue ? <InfoRow label="Issue" value={`#${workspace.github_issue.number} ${workspace.github_issue.title}`} /> : null}
          {workspace.github_pr ? <InfoRow label="PR" value={`#${workspace.github_pr.number} ${workspace.github_pr.title}`} /> : null}
          {workspace.labels.length > 0 ? (
            <View style={styles.labelBlock}>
              <Text style={[styles.rowLabel, { color: theme.colors.secondaryLabel }]}>Labels</Text>
              <View style={styles.chips}>
                {workspace.labels.map((label) => (
                  <View key={label.guid} style={[styles.chip, { backgroundColor: theme.colors.label }]}>
                    <Text style={[styles.chipText, { color: theme.colors.labelInverse }]}>{label.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function InfoRow({
  label,
  selectable,
  value,
}: {
  label: string;
  selectable?: boolean;
  value: string;
}) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.separator }]}>
      <Text style={[styles.rowLabel, { color: theme.colors.secondaryLabel }]}>{label}</Text>
      <Text
        selectable={selectable}
        style={[styles.rowValue, { color: theme.colors.label }]}
        numberOfLines={label === "Path" ? 2 : 1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 30,
  },
  panel: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.glassBorder,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 14,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 42,
  },
  rowLabel: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    width: 82,
  },
  rowValue: {
    color: colors.label,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "right",
  },
  labelBlock: {
    gap: 10,
    paddingTop: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.label,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.labelInverse,
    fontSize: 12,
    fontWeight: "800",
  },
});
