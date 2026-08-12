import { radii } from "@/theme/radii";
import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMobileTheme } from "@/theme/theme-store";

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

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
        <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.ctaFill}
      style={styles.stretchHost}
    >
      <Button
        label={"Allow camera"}
        onPress={() => void requestPermission()}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.ctaFill,
      borderRadius: radii.control,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="filled"
      />
    </Host>
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
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
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
