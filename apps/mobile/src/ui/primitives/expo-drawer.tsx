import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { BottomSheet, RNHostView } from "@expo/ui";
import { environment, frame, presentationBackground } from "@expo/ui/swift-ui/modifiers";
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
  contentPaddingBottom,
  contentPaddingHorizontal = 16,
  fillBackground = true,
  isPresented,
  matchContents = true,
  onDismiss,
  snapPoints = ["half", "full"],
  testID,
}: {
  children: ReactNode;
  colorScheme?: MobileThemeColorScheme;
  /** Inset between the sheet edge and its content. */
  contentPaddingBottom?: number;
  contentPaddingHorizontal?: number;
  /** Paint a rect behind the content. Leave the sheet's own rounded background visible instead. */
  fillBackground?: boolean;
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
          ...(matchContents ? [] : [frame({ alignment: "top", maxHeight: Number.POSITIVE_INFINITY, maxWidth: Number.POSITIVE_INFINITY })]),
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
            backgroundColor: fillBackground ? palette.colors.sheetBackground : "transparent",
            alignSelf: "stretch",
            justifyContent: "flex-start",
            paddingBottom: contentPaddingBottom ?? Math.max(insets.bottom, 24),
            paddingHorizontal: contentPaddingHorizontal,
            paddingTop: 16,
            width: "100%",
            // A scroll view inside a detent must not report its full content height,
            // or the sheet treats the drag as its own pan and snaps back.
            ...(matchContents ? {} : { flexGrow: 1, height: 0 }),
          }}
        >
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
