import { StyleSheet, Text, View } from "react-native";
import { InlineError } from "@/ui/layout/app-screen";
import { NativeButton, NativeTextInput } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

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
        <NativeButton
          label={isCommitting ? "Committing..." : "Commit"}
          onPress={onCommit}
          disabled={!canCommit || !message.trim() || isCommitting}
        />
        <NativeButton
          label={isPushing ? "Pushing..." : "Push"}
          onPress={onPush}
          disabled={!canPush || isPushing}
        />
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
