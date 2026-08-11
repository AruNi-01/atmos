import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { NativeButton } from "@/ui/primitives/native-controls";
import { useMobileTheme } from "@/theme/theme-store";

export function PairQrScanner({
  disabled,
  onScanned,
}: {
  disabled?: boolean;
  onScanned: (value: string) => void;
}) {
  const theme = useMobileTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [permission?.granted, requestPermission]);

  if (!permission) {
    return (
      <Text style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
        Checking camera permission…
      </Text>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBlock}>
        <Text style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
          Camera access is required to scan the pair QR code.
        </Text>
        <NativeButton label="Allow camera" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          disabled || locked
            ? undefined
            : ({ data }) => {
                if (!data?.trim()) return;
                setLocked(true);
                onScanned(data.trim());
              }
        }
      />
      <Text style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
        Point at the QR from Desktop/Web · Pair phone
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    gap: 10,
    overflow: "hidden",
    borderRadius: 16,
  },
  camera: {
    aspectRatio: 1,
    borderRadius: 16,
    width: "100%",
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  permissionBlock: {
    gap: 10,
  },
});
