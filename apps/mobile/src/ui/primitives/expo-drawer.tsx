import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { BottomSheet, RNHostView } from "@expo/ui";
import { environment, presentationBackground } from "@expo/ui/swift-ui/modifiers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileThemeColorScheme } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { drawerPalette } from "@/ui/primitives/expo-drawer-theme";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

/**
 * Expo `@expo/ui` BottomSheet drawer. Use for group lists and similar drawers.
 * Popovers must use `IosPopover` instead.
 *
 * On iOS 26 the system sheet already insets the half detent from the display
 * edge and edge-attaches at the large detent — that is not a separate prop.
 */
export function ExpoDrawer({
  children,
  colorScheme,
  isPresented,
  matchContents = true,
  onDismiss,
  snapPoints = ["half", "full"],
  testID,
}: {
  children: ReactNode;
  colorScheme?: MobileThemeColorScheme;
  isPresented: boolean;
  /** Size the sheet to its content. Turn off to fill the detent and top-align short lists. */
  matchContents?: boolean;
  onDismiss: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const palette = drawerPalette(theme.colors, theme.colorScheme, colorScheme);
  const iosModifiers =
    Platform.OS === "ios"
      ? [
          environment("colorScheme", palette.scheme),
          presentationBackground(palette.colors.sheetBackground),
        ]
      : undefined;

  return (
    <BottomSheet
      isPresented={isPresented}
      modifiers={iosModifiers}
      onDismiss={onDismiss}
      snapPoints={snapPoints}
      testID={testID}
    >
      <RNHostView matchContents={matchContents}>
        <View
          style={{
            backgroundColor: palette.colors.sheetBackground,
            flex: matchContents ? undefined : 1,
            justifyContent: "flex-start",
            paddingBottom: Math.max(insets.bottom, 24),
            paddingHorizontal: 16,
            paddingTop: 16,
          }}
        >
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
