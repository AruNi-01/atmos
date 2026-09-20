import { Pressable, Switch, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { usePreviewStore } from "@/stores/preview-store";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export function PreviewModeSwitch({
  variant = "row",
}: {
  variant?: "row" | "hero" | "header";
}) {
  const theme = useMobileTheme();
  const router = useRouter();
  const enabled = usePreviewStore((state) => state.enabled);
  const setEnabled = usePreviewStore((state) => state.setEnabled);

  const openPreview = () => {
    setEnabled(true);
    router.push("/preview");
  };

  const apply = (next: boolean) => {
    if (next) {
      openPreview();
      return;
    }
    setEnabled(false);
    router.replace("/");
  };

  const switchControl = (
    <Switch
      accessibilityLabel="Test page"
      onValueChange={apply}
      trackColor={{ false: theme.colors.controlSecondary, true: theme.colors.green }}
      value={enabled}
    />
  );

  if (variant === "header") {
    return <View style={styles.headerWrap}>{switchControl}</View>;
  }

  const copy = (
    <Pressable accessibilityRole="button" onPress={openPreview} style={styles.copy}>
      <Text style={[typography.rowTitle, { color: theme.colors.label, fontWeight: "600" }]}>
        Test page
      </Text>
      <Text style={[typography.rowSubtitle, { color: theme.colors.secondaryLabel }]}>
        Preview terminals without a Computer
      </Text>
    </Pressable>
  );

  if (variant === "hero") {
    return (
      <View style={styles.heroRow}>
        {copy}
        {switchControl}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {copy}
      {switchControl}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  headerWrap: {
    paddingHorizontal: 8,
  },
  heroRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    maxWidth: 340,
    paddingTop: 18,
    width: "100%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.rowTitleGap,
    minHeight: spacing.rowMinHeight,
    paddingHorizontal: spacing.rowX,
    paddingVertical: spacing.rowY,
  },
});
