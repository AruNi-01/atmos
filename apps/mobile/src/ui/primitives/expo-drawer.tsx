import type { ReactNode } from "react";
import { BottomSheet, RNHostView } from "@expo/ui";
import { View } from "react-native";
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

  return (
    <BottomSheet isPresented={isPresented} onDismiss={onDismiss} snapPoints={snapPoints} testID={testID}>
      <RNHostView matchContents>
        <View style={{ backgroundColor: theme.colors.sheetBackground }}>{children}</View>
      </RNHostView>
    </BottomSheet>
  );
}
