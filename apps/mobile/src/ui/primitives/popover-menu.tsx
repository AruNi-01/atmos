import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CheckIcon } from "@/ui/icons/lucide-native";
import { IosPopover } from "@/ui/primitives/ios-popover";
import { useMobileTheme } from "@/theme/theme-store";

export function PopoverActionList({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

export function PopoverMenuSeparator({ tone = "app" }: { tone?: "app" | "terminal" }) {
  const theme = useMobileTheme();
  return (
    <View
      style={[
        styles.separator,
        {
          backgroundColor: tone === "terminal" ? theme.colors.glassBorder : theme.colors.separator,
        },
      ]}
    />
  );
}

export function PopoverActionRow({
  destructive,
  label,
  onPress,
  selected,
  tone = "app",
}: {
  destructive?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
  tone?: "app" | "terminal";
}) {
  const theme = useMobileTheme();
  const color = destructive
    ? theme.colors.red
    : tone === "terminal"
      ? theme.colors.terminalFg
      : theme.colors.label;

  return (
    <IosPopover.Pressable dismissOnPress onPress={onPress} style={styles.row}>
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {label}
      </Text>
      {selected ? <CheckIcon color={color} size={16} strokeWidth={2.4} /> : null}
    </IosPopover.Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    flex: 1,
    fontSize: 17,
    fontWeight: "400",
    lineHeight: 22,
  },
  list: {
    minWidth: 220,
    paddingVertical: 6,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
});
