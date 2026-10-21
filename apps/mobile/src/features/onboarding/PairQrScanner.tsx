import { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CAMERA_PREVIEW_TIMEOUT_MS,
  cameraScannerModel,
  shouldArmCameraPreviewTimer,
} from "@/features/onboarding/camera-permission-state";
import { CameraPermissionStateView } from "@/features/onboarding/CameraPermissionStateView";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";

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
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const asked = useRef(false);

  const model = cameraScannerModel({
    mountError,
    permission: permission
      ? {
          canAskAgain: permission.canAskAgain,
          granted: permission.granted,
          status: permission.status,
        }
      : null,
    ready,
    timedOut,
  });
  const autoRequest = model.kind === "prompt" && model.autoRequest;

  useEffect(() => {
    if (!autoRequest || asked.current) return;
    asked.current = true;
    void requestPermission().catch((error: unknown) => {
      setMountError(error instanceof Error ? error.message : "Could not request camera access.");
    });
  }, [autoRequest, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void getPermission().catch((error: unknown) => {
        setMountError(error instanceof Error ? error.message : "Could not read camera access.");
      });
    });
    return () => subscription.remove();
  }, [getPermission]);

  useEffect(() => {
    if (
      !shouldArmCameraPreviewTimer({
        granted: Boolean(permission?.granted),
        mountError,
        ready,
        timedOut,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), CAMERA_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mountError, permission?.granted, ready, timedOut]);

  const retry = () => {
    setMountError(null);
    setReady(false);
    setTimedOut(false);
  };

  if (model.kind !== "preview" && model.kind !== "starting") {
    return (
      <CameraPermissionStateView
        model={model}
        onAllow={() => {
          void requestPermission().catch((error: unknown) => {
            setMountError(
              error instanceof Error ? error.message : "Could not request camera access.",
            );
          });
        }}
        onOpenSettings={() => {
          void Linking.openSettings();
        }}
        onRetry={retry}
      />
    );
  }

  const shellBg = theme.isDark ? theme.colors.cardElevated : "#0a0a0b";
  const shellBorder = theme.isDark ? "rgba(255, 255, 255, 0.22)" : theme.colors.separator;
  const shellBorderWidth = theme.isDark ? 1 : StyleSheet.hairlineWidth;
  const shellPadding = theme.isDark ? DARK_BEZEL : 0;
  const wellRadius = Math.max(radii.card - shellPadding, 12);

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
      <View style={[styles.cameraWell, { borderRadius: wellRadius }]}>
        <CameraView
          active={!locked}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          facing="back"
          onBarcodeScanned={
            disabled || locked || model.kind !== "preview"
              ? undefined
              : ({ data }) => {
                  if (!data?.trim()) return;
                  setLocked(true);
                  onScanned(data.trim());
                }
          }
          onCameraReady={() => setReady(true)}
          onMountError={(event) => {
            setMountError(event.message?.trim() || "The camera could not be started.");
          }}
          style={styles.camera}
        />
        {model.kind === "starting" ? (
          <View style={[styles.cover, { backgroundColor: theme.colors.sheetBackground }]}>
            <CameraPermissionStateView model={model} />
          </View>
        ) : (
          <View pointerEvents="none" style={styles.reticle}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    ...StyleSheet.absoluteFill,
  },
  cameraShell: {
    aspectRatio: 1,
    borderCurve: "continuous",
    borderRadius: radii.card,
    overflow: "hidden",
    width: "100%",
  },
  cameraWell: {
    backgroundColor: "#000000",
    borderCurve: "continuous",
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  corner: {
    borderColor: "#ffffff",
    borderWidth: 3,
    height: 28,
    position: "absolute",
    width: 28,
  },
  cover: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
  },
  reticle: {
    ...StyleSheet.absoluteFill,
    margin: 48,
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
});
