import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
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

  return (
    <Modal animationType="slide" onRequestClose={onDismiss} testID={testID} transparent visible={isPresented}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { backgroundColor: theme.colors.sheetBackground }]}
        >
          <View style={styles.handle} />
          <View style={styles.body}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    flex: 1,
    justifyContent: "flex-end",
  },
  body: {
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "rgba(60, 60, 67, 0.28)",
    borderRadius: 2,
    height: 5,
    marginBottom: 8,
    width: 36,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "72%",
    width: "100%",
  },
});
