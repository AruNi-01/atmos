import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CameraScannerModel } from "@/features/onboarding/camera-permission-state";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";

type VisibleModel = Exclude<CameraScannerModel, { kind: "preview" }>;

export function CameraPermissionStateView({
  model,
  onAllow,
  onOpenSettings,
  onRetry,
}: {
  model: VisibleModel;
  onAllow?: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
}) {
  const theme = useMobileTheme();
  const copy = copyFor(model);
  const action =
    model.kind === "prompt"
      ? { label: "Allow camera", onPress: onAllow }
      : model.kind === "settings"
        ? { label: "Open Settings", onPress: onOpenSettings }
        : model.kind === "error"
          ? { label: "Try again", onPress: onRetry }
          : null;

  return (
    <View
      accessibilityLabel={copy.title}
      style={[styles.panel, { backgroundColor: theme.colors.sheetBackground }]}
      testID="camera-permission-state"
    >
      <Text style={[styles.title, { color: theme.colors.label }]}>{copy.title}</Text>
      {copy.body ? (
        <Text style={[styles.body, { color: theme.colors.secondaryLabel }]}>{copy.body}</Text>
      ) : null}
      {action?.onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={[styles.action, { backgroundColor: theme.colors.card }]}
        >
          <Text style={[styles.actionLabel, { color: theme.colors.label }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function copyFor(model: VisibleModel): { body?: string; title: string } {
  switch (model.kind) {
    case "loading":
      return {
        body: "Waiting to see whether camera access is allowed.",
        title: "Checking camera…",
      };
    case "prompt":
      return {
        body: "Atmos needs the camera to scan a pair QR.",
        title: "Camera access is required to scan a pair QR.",
      };
    case "settings":
      return {
        body: "Allow camera access in Settings to scan a pair QR.",
        title: "Camera access is off",
      };
    case "starting":
      return {
        body: "The preview appears when the camera is ready.",
        title: "Starting camera…",
      };
    case "error":
      return { body: model.message, title: "Camera unavailable" };
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}

export function CameraSheetFallback({ children }: { children?: ReactNode }) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.sheet, { backgroundColor: theme.colors.sheetBackground }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    borderRadius: radii.control,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  panel: {
    alignItems: "center",
    borderRadius: radii.card,
    gap: 8,
    justifyContent: "center",
    minHeight: 220,
    padding: 24,
    width: "100%",
  },
  sheet: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
    textAlign: "center",
  },
});
