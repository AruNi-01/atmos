import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import { InlineError } from "@/ui/layout/app-screen";
import { NativeTextInput } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

export function CommitSheet({
  message,
  onChangeMessage,
  onCommit,
  onPush,
  isCommitting,
  isPushing,
  error,
  successMessage,
  canCommit = true,
  canPush,
}: {
  message: string;
  onChangeMessage: (message: string) => void;
  onCommit: () => void;
  onPush: () => void;
  isCommitting?: boolean;
  isPushing?: boolean;
  error?: string | null;
  successMessage?: string | null;
  canCommit?: boolean;
  canPush?: boolean;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.root}>
      <NativeTextInput
        value={message}
        minHeight={72}
        multiline
        onChangeText={onChangeMessage}
        placeholder="Commit message"
      />
      <View style={styles.actions}>
        <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!canCommit || !message.trim() || isCommitting ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        disabled={!canCommit || !message.trim() || isCommitting}
        label={isCommitting ? "Committing..." : "Commit"}
        onPress={(!canCommit || !message.trim() || isCommitting) ? undefined : (onCommit)}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: !canCommit || !message.trim() || isCommitting ? theme.colors.controlDisabled : theme.colors.ctaFill,
      borderRadius: radii.control,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="filled"
      />
    </Host>
        <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!canPush || isPushing ? theme.colors.tertiaryLabel : theme.colors.label}
      style={styles.stretchHost}
    >
      <Button
        disabled={!canPush || isPushing}
        label={isPushing ? "Pushing..." : "Push"}
        onPress={(!canPush || isPushing) ? undefined : (onPush)}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: !canPush || isPushing ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
      </View>
      {successMessage ? (
        <View
          style={[
            styles.success,
            { backgroundColor: theme.colors.greenSurface, borderColor: theme.colors.greenBorder },
          ]}
        >
          <Text selectable style={[styles.successText, { color: theme.colors.green }]}>
            {successMessage}
          </Text>
        </View>
      ) : null}
      <InlineError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  actions: {
    gap: 10,
  },
  root: {
    gap: 12,
    padding: 16,
  },
  success: {
    backgroundColor: colors.greenSurface,
    borderColor: colors.greenBorder,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  successText: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 20,
  },
});
