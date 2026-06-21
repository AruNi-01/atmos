import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function Row({
  title,
  subtitle,
  meta,
  onPress,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useMobileTheme();
  const content = (
    <View style={styles.row}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.label }]} numberOfLines={2}>
          {title}
        </Text>
        {children}
        {onPress && !children ? (
          <Text
            style={[styles.chevron, { color: theme.colors.tertiaryLabel }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            ›
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={[styles.meta, { color: theme.colors.secondaryLabel }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.secondaryLabel }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function Separator() {
  const theme = useMobileTheme();
  return <View style={[styles.separator, { backgroundColor: theme.colors.separator }]} />;
}

const styles = StyleSheet.create({
  row: {
    gap: 5,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  title: {
    color: colors.label,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    lineHeight: 18,
  },
  chevron: {
    color: colors.tertiaryLabel,
    fontSize: 22,
    lineHeight: 24,
    marginLeft: -4,
  },
  pressed: {
    opacity: 0.55,
  },
  separator: {
    backgroundColor: colors.separator,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
