import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { GitFileDiffResponse } from "@/api/types";
import { createInlineDiff } from "@/features/git/diff";
import { colors } from "@/theme/colors";

export function FileDiffView({ diff }: { diff: GitFileDiffResponse | null }) {
  if (!diff) return null;

  const lines = createInlineDiff(diff.old_content, diff.new_content);

  return (
    <View style={styles.root}>
      <Text selectable style={styles.title} numberOfLines={1}>
        {diff.file_path}
      </Text>
      <ScrollView horizontal={false} style={styles.body} contentContainerStyle={styles.content}>
        {lines.slice(0, 500).map((line, index) => (
          <View
            key={`${line.kind}:${index}`}
            style={[
              styles.line,
              line.kind === "added" && styles.added,
              line.kind === "removed" && styles.removed,
            ]}
          >
            <Text selectable style={styles.lineNumber}>
              {line.oldLineNumber ?? line.newLineNumber ?? ""}
            </Text>
            <Text selectable style={styles.code}>
              {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
              {line.content || " "}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: 360,
  },
  title: {
    color: colors.label,
    fontSize: 13,
    fontWeight: "700",
    padding: 12,
  },
  body: {
    backgroundColor: colors.cardSubtle,
  },
  content: {
    paddingBottom: 12,
  },
  line: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  added: {
    backgroundColor: colors.greenSurface,
  },
  removed: {
    backgroundColor: colors.redSurface,
  },
  lineNumber: {
    color: colors.tertiaryLabel,
    fontFamily: "Menlo",
    fontSize: 11,
    minWidth: 32,
    textAlign: "right",
  },
  code: {
    color: colors.label,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16,
  },
});
