import { Button as ExpoButton, Host as ExpoHost } from "@expo/ui";
import { Button, Host, HStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, disabled } from "@expo/ui/swift-ui/modifiers";
import { Platform, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { expoUiSecondaryStyle } from "@/ui/primitives/expo-ui-button-styles";

export type GlassAction = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  role?: "destructive";
};

/** Right-aligned glass actions. Two actions sit on one row. */
export function GlassActionButtons({ actions }: { actions: GlassAction[] }) {
  if (Platform.OS === "ios") {
    return <IosGlassActionButtons actions={actions} />;
  }
  return <FallbackActionButtons actions={actions} />;
}

function IosGlassActionButtons({ actions }: { actions: GlassAction[] }) {
  const theme = useMobileTheme();

  return (
    <View style={{ alignItems: "flex-end" }}>
      <Host colorScheme={theme.colorScheme} matchContents>
        <HStack alignment="center" spacing={8}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              modifiers={[
                buttonStyle("glass"),
                controlSize("regular"),
                disabled(Boolean(action.disabled)),
              ]}
              onPress={action.disabled ? undefined : action.onPress}
              role={action.role ?? "default"}
            />
          ))}
        </HStack>
      </Host>
    </View>
  );
}

function FallbackActionButtons({ actions }: { actions: GlassAction[] }) {
  const theme = useMobileTheme();

  return (
    <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
      {actions.map((action) => {
        const look = expoUiSecondaryStyle(theme.colors, action.disabled);
        return (
          <ExpoHost
            colorScheme={theme.colorScheme}
            key={action.label}
            matchContents={{ vertical: true }}
            seedColor={action.role === "destructive" ? theme.colors.red : look.seedColor}
          >
            <ExpoButton
              disabled={action.disabled}
              label={action.label}
              onPress={action.disabled ? undefined : action.onPress}
              style={look.style}
              variant="outlined"
            />
          </ExpoHost>
        );
      })}
    </View>
  );
}
