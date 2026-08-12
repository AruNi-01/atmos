import { Image, StyleSheet, Text, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeMenuButtonProps } from "./native-menu-button.types";

export function NativeMenuButton({
  actions,
  androidIcon,
  disabled,
  iconOnly,
  label,
  onAction,
  tintColor,
  title,
}: NativeMenuButtonProps) {
  const theme = useMobileTheme();
  const resolvedTintColor = disabled ? theme.colors.tertiaryLabel : (tintColor ?? theme.colors.label);

  return (
    <MenuView
      actions={disabled ? actions.map((action) => ({ ...action, attributes: { ...action.attributes, disabled: true } })) : actions}
      onPressAction={(event) => onAction(event.nativeEvent.event)}
      shouldOpenOnLongPress={false}
      title={title}
    >
      <View
        style={[
          styles.trigger,
          {
            backgroundColor: theme.colors.glassFallbackStrong,
            borderColor: theme.colors.glassBorder,
          },
          iconOnly && styles.iconOnlyTrigger,
          disabled && styles.triggerDisabled,
        ]}
      >
        {iconOnly && androidIcon ? (
          <Image
            source={androidIcon}
            style={[
              styles.icon,
              { tintColor: resolvedTintColor },
            ]}
          />
        ) : (
          <Text
            style={[
              styles.label,
              { color: resolvedTintColor },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
        {iconOnly ? null : (
          <Text style={[styles.chevron, { color: disabled ? theme.colors.tertiaryLabel : theme.colors.label }]}>⌄</Text>
        )}
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  chevron: {
    color: colors.label,
    fontSize: 14,
    fontWeight: "800",
    marginTop: -1,
  },
  icon: {
    height: 19,
    tintColor: colors.label,
    width: 19,
  },
  iconOnlyTrigger: {
    minWidth: 44,
    paddingHorizontal: 10,
  },
  label: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "700",
    maxWidth: 150,
  },
  trigger: {
    alignItems: "center",
    borderColor: colors.glassBorder,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
});
