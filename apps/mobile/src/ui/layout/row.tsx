import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";

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
  const content = (
    <View style={styles.row}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {children}
        {onPress && !children ? (
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            ›
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
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
  return <View style={styles.separator} />;
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
