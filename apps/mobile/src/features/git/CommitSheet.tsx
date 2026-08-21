import { Button, Host } from "@expo/ui";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import { InlineError } from "@/ui/layout/app-screen";
import { NativeTextInput } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import {
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

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
        {(() => {
          const commitDisabled = !canCommit || !message.trim() || isCommitting;
          const commitStyle = expoUiPrimaryStyle(theme.colors, commitDisabled);
          const pushDisabled = !canPush || isPushing;
          const pushStyle = expoUiSecondaryStyle(theme.colors, pushDisabled);
          return (
            <>
              <Host
                matchContents={{ vertical: true }}
                colorScheme={theme.colorScheme}
                seedColor={commitStyle.seedColor}
                style={styles.stretchHost}
              >
                <Button
                  disabled={commitDisabled}
                  label={isCommitting ? "Committing..." : "Commit"}
                  onPress={commitDisabled ? undefined : onCommit}
                  modifiers={buttonStretchModifiers}
                  style={commitStyle.style}
                  variant={commitStyle.variant}
                />
              </Host>
              <Host
                matchContents={{ vertical: true }}
                colorScheme={theme.colorScheme}
                seedColor={pushStyle.seedColor}
                style={styles.stretchHost}
              >
                <Button
                  disabled={pushDisabled}
                  label={isPushing ? "Pushing..." : "Push"}
                  onPress={pushDisabled ? undefined : onPush}
                  modifiers={buttonStretchModifiers}
                  style={pushStyle.style}
                  variant={pushStyle.variant}
                />
              </Host>
            </>
          );
        })()}
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
