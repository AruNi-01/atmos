import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ProjectModel, WorkspaceModel } from "@/api/types";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { colors, radii } from "@/theme/colors";

export function WorkspaceOverview({
  project,
  workspace,
}: {
  project: ProjectModel | null;
  workspace: WorkspaceModel;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never">
      <GlassPanel fallbackStyle={styles.panelFallback} glassEffectStyle={{ style: "regular", animate: true }} style={styles.panel}>
        <InfoRow label="Workspace" value={workspace.display_name ?? workspace.name} />
        <InfoRow label="Project" value={project?.name ?? "Unknown"} />
        <InfoRow label="Branch" value={workspace.branch || "None"} />
        <InfoRow label="Path" value={workspace.local_path} selectable />
      </GlassPanel>

      <GlassPanel fallbackStyle={styles.panelFallback} glassEffectStyle={{ style: "regular", animate: true }} style={styles.panel}>
        <InfoRow label="Status" value={workspace.workflow_status} />
        <InfoRow label="Priority" value={workspace.priority} />
        <InfoRow label="Base" value={workspace.base_branch || "None"} />
        <InfoRow label="Source" value={workspace.create_source} />
      </GlassPanel>

      {workspace.github_issue || workspace.github_pr || workspace.labels.length > 0 ? (
        <GlassPanel fallbackStyle={styles.panelFallback} glassEffectStyle={{ style: "regular", animate: true }} style={styles.panel}>
          {workspace.github_issue ? <InfoRow label="Issue" value={`#${workspace.github_issue.number} ${workspace.github_issue.title}`} /> : null}
          {workspace.github_pr ? <InfoRow label="PR" value={`#${workspace.github_pr.number} ${workspace.github_pr.title}`} /> : null}
          {workspace.labels.length > 0 ? (
            <View style={styles.labelBlock}>
              <Text style={styles.rowLabel}>Labels</Text>
              <View style={styles.chips}>
                {workspace.labels.map((label) => (
                  <View key={label.guid} style={styles.chip}>
                    <Text style={styles.chipText}>{label.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </GlassPanel>
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
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable={selectable} style={styles.rowValue} numberOfLines={label === "Path" ? 2 : 1}>
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
    borderRadius: radii.card,
    padding: 14,
  },
  panelFallback: {
    backgroundColor: colors.glassFallbackStrong,
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
