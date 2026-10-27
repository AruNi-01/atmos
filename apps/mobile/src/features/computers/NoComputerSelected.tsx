import { Platform, View } from "react-native";
import { Button, Host } from "@expo/ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";
import { useRouter } from "expo-router";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { EmptyState, InlineError } from "@/ui/layout/app-screen";

/**
 * Glass action that hugs its label. No border shape: a rectangle clips the
 * glass and leaves square corners.
 */
function glassActionModifiers() {
  return Platform.select({
    ios: [controlSize("large"), buttonStyle("glass")],
    default: undefined,
  });
}

function NoComputerButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <Host
      colorScheme={theme.colorScheme}
      matchContents
      style={{ alignSelf: "center", overflow: "visible" }}
    >
      <Button label={label} modifiers={glassActionModifiers()} onPress={onPress} />
    </Host>
  );
}

/** Centered empty state for a navbar page that still needs a Computer. */
export function NoComputerSelected({
  detail,
  message,
  onPress,
}: {
  detail?: string | null;
  message: string;
  onPress?: () => void;
}) {
  const theme = useMobileTheme();
  const router = useRouter();
  const press = onPress ?? (() => router.push("/settings/computers"));

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.background,
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: spacing.screenX,
      }}
    >
      <View style={{ alignSelf: "stretch", gap: 20, overflow: "visible", paddingHorizontal: 8 }}>
        <EmptyState message={message} title="No Computer selected" />
        <View style={{ alignItems: "center", alignSelf: "stretch", overflow: "visible" }}>
          <NoComputerButton label="Choose a Computer" onPress={press} />
        </View>
        <InlineError message={detail} />
      </View>
    </View>
  );
}
