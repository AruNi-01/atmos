import { BottomSheet, type SnapPoint } from "@expo/ui";
import type { ReactNode } from "react";

export function NativeBottomSheet({
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
  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      showDragIndicator
      snapPoints={snapPoints}
      testID={testID}
    >
      {children}
    </BottomSheet>
  );
}
