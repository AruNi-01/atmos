import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { Button, Host } from "@expo/ui";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { QrCodeIcon } from "@/ui/icons/lucide-native";
import { expoUiButtonHostStyle } from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

/** Outer chrome width so the elevated frame stays visible when the feed is black. */
const DARK_BEZEL = 3;

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

  // Light: solid near-black tile on light page.
  // Dark: elevated gray bezel on pure black page (CameraView alone is black and
  // would otherwise disappear into the background).
  const shellBg = theme.isDark ? theme.colors.cardElevated : "#0a0a0b";
  const shellBorder = theme.isDark
    ? "rgba(255, 255, 255, 0.22)"
    : theme.colors.separator;
  const shellBorderWidth = theme.isDark ? 1 : StyleSheet.hairlineWidth;
  const shellPadding = theme.isDark ? DARK_BEZEL : 0;
  const wellRadius = Math.max(radii.card - shellPadding, 12);
  const reticleColor = "#ffffff";
  const placeholderBg = theme.isDark
    ? theme.colors.cardElevated
    : theme.colors.cardSubtle;

  if (!permission) {
    return (
      <View
        style={[
          styles.placeholder,
          {
            backgroundColor: placeholderBg,
            borderColor: shellBorder,
            borderWidth: shellBorderWidth,
          },
        ]}
      >
        <Text style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
          Checking camera…
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBlock}>
        <View
          style={[
            styles.placeholder,
            {
              backgroundColor: placeholderBg,
              borderColor: shellBorder,
              borderWidth: shellBorderWidth,
            },
          ]}
        >
          <QrCodeIcon color={theme.colors.tertiaryLabel} size={40} strokeWidth={1.6} />
          <Text style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
            Camera access is required to scan a pair QR.
          </Text>
        </View>
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={theme.colors.primary}
          style={expoUiButtonHostStyle}
        >
          <Button
            label="Allow camera"
            modifiers={buttonStretchModifiers}
            onPress={() => void requestPermission()}
            style={{ height: 52 }}
            variant="filled"
          />
        </Host>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cameraShell,
        {
          backgroundColor: shellBg,
          borderColor: shellBorder,
          borderWidth: shellBorderWidth,
          padding: shellPadding,
        },
      ]}
    >
      <View
        style={[
          styles.cameraWell,
          {
            backgroundColor: "#000000",
            borderRadius: wellRadius,
          },
        ]}
      >
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
        <View pointerEvents="none" style={styles.reticle}>
          <View style={[styles.corner, styles.tl, { borderColor: reticleColor }]} />
          <View style={[styles.corner, styles.tr, { borderColor: reticleColor }]} />
          <View style={[styles.corner, styles.bl, { borderColor: reticleColor }]} />
          <View style={[styles.corner, styles.br, { borderColor: reticleColor }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraShell: {
    aspectRatio: 1,
    borderCurve: "continuous",
    borderRadius: radii.card,
    overflow: "hidden",
    width: "100%",
  },
  cameraWell: {
    borderCurve: "continuous",
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  reticle: {
    ...StyleSheet.absoluteFill,
    margin: 48,
  },
  corner: {
    borderWidth: 3,
    height: 28,
    position: "absolute",
    width: 28,
  },
  tl: {
    borderBottomWidth: 0,
    borderRightWidth: 0,
    left: 0,
    top: 0,
  },
  tr: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    right: 0,
    top: 0,
  },
  bl: {
    borderRightWidth: 0,
    borderTopWidth: 0,
    bottom: 0,
    left: 0,
  },
  br: {
    borderLeftWidth: 0,
    borderTopWidth: 0,
    bottom: 0,
    right: 0,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  placeholder: {
    alignItems: "center",
    aspectRatio: 1,
    borderCurve: "continuous",
    borderRadius: radii.card,
    gap: 12,
    justifyContent: "center",
    padding: 24,
    width: "100%",
  },
  permissionBlock: {
    gap: 12,
    width: "100%",
  },
});
