import type { ReactNode } from "react";
import { BottomSheet, RNHostView } from "@expo/ui";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileTheme } from "@/theme/theme-store";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

/**
 * Expo `@expo/ui` BottomSheet drawer. Use for group lists and similar drawers.
 * Popovers must use `IosPopover` instead.
 */
export function ExpoDrawer({
  children,
  isPresented,
  onDismiss,
  snapPoints = ["half", "full"],
  testID,
}: {
  children: ReactNode;
  isPresented: boolean;
  onDismiss: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet isPresented={isPresented} onDismiss={onDismiss} snapPoints={snapPoints} testID={testID}>
      <RNHostView matchContents>
        <View
          style={{
            backgroundColor: theme.colors.sheetBackground,
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
