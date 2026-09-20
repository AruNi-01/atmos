import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileTheme } from "@/theme/theme-store";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

/**
 * Web fallback for the Expo BottomSheet drawer. Native iOS/Android keep `@expo/ui`.
 */
export function ExpoDrawer({
  children,
  isPresented,
  onDismiss,
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
    <Modal animationType="slide" onRequestClose={onDismiss} testID={testID} transparent visible={isPresented}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.sheetBackground,
              paddingBottom: Math.max(insets.bottom, 28),
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: theme.isDark ? "rgba(235, 235, 245, 0.32)" : "rgba(60, 60, 67, 0.30)",
              },
            ]}
          />
          <View style={styles.body}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.36)",
    flex: 1,
    justifyContent: "flex-end",
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  handle: {
    alignSelf: "center",
    borderRadius: 999,
    height: 5,
    marginTop: 12,
    width: 36,
  },
  sheet: {
    borderCurve: "continuous",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    boxShadow: "0 -12px 40px rgba(0, 0, 0, 0.28)",
    maxHeight: "78%",
    width: "100%",
  },
});
