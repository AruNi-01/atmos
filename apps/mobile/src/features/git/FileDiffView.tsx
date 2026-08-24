import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { GitFileDiffResponse } from "@/api/types";
import { createInlineDiff } from "@/features/git/diff";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileDiffView({ diff }: { diff: GitFileDiffResponse | null }) {
  const theme = useMobileTheme();

  if (!diff) return null;

  const kind = diff.kind ?? "text";
  if (kind !== "text") {
    const sizeLabel =
      diff.old_size != null || diff.new_size != null
        ? `${formatBytes(diff.old_size)} → ${formatBytes(diff.new_size)}`
        : null;
    const title =
      kind === "too_large"
        ? "File too large to display as text"
        : diff.status === "A"
          ? "Binary file added"
          : diff.status === "D"
            ? "Binary file deleted"
            : "Binary file changed";
    return (
      <View style={[styles.root, { borderTopColor: theme.colors.separator }]}>
        <Text selectable style={[styles.title, { color: theme.colors.label }]} numberOfLines={1}>
          {diff.file_path}
        </Text>
        <View style={[styles.body, styles.binaryBody, { backgroundColor: theme.colors.cardSubtle }]}>
          <Text style={[styles.binaryTitle, { color: theme.colors.label }]}>{title}</Text>
          {sizeLabel ? (
            <Text style={[styles.binaryMeta, { color: theme.colors.tertiaryLabel }]}>
              {sizeLabel}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const oldText = diff.old_text ?? "";
  const newText = diff.new_text ?? "";
  const lines = createInlineDiff(oldText, newText);

  return (
    <View style={[styles.root, { borderTopColor: theme.colors.separator }]}>
      <Text selectable style={[styles.title, { color: theme.colors.label }]} numberOfLines={1}>
        {diff.file_path}
      </Text>
      <ScrollView
        horizontal={false}
        style={[styles.body, { backgroundColor: theme.colors.cardSubtle }]}
        contentContainerStyle={styles.content}
      >
        {lines.slice(0, 500).map((line, index) => (
          <View
            key={`${line.kind}:${index}`}
            style={[
              styles.line,
              line.kind === "added" && { backgroundColor: theme.colors.greenSurface },
              line.kind === "removed" && { backgroundColor: theme.colors.redSurface },
            ]}
          >
            <Text selectable style={[styles.lineNumber, { color: theme.colors.tertiaryLabel }]}>
              {line.oldLineNumber ?? line.newLineNumber ?? ""}
            </Text>
            <Text selectable style={[styles.code, { color: theme.colors.label }]}>
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
  binaryBody: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  binaryTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  binaryMeta: {
    fontFamily: "Menlo",
    fontSize: 11,
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
