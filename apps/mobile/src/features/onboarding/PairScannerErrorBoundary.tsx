import { Component, type ReactNode } from "react";
import { Text } from "react-native";
import {
  CameraPermissionStateView,
  CameraSheetFallback,
} from "@/features/onboarding/CameraPermissionStateView";
import { useMobileTheme } from "@/theme/theme-store";

type BoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
};

type BoundaryState = { error: Error | null };

export class PairScannerErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error);
    return (
      <CameraPermissionStateView
        model={{
          kind: "error",
          message: this.state.error.message || "The camera screen failed to render.",
        }}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

export function SignInCrashFallback() {
  const theme = useMobileTheme();
  return (
    <CameraSheetFallback>
      <Text
        style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600", textAlign: "center" }}
      >
        This screen could not be opened.
      </Text>
      <Text
        style={{
          color: theme.colors.secondaryLabel,
          fontSize: 15,
          lineHeight: 21,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        Close the sheet and try Re-pair phone again.
      </Text>
    </CameraSheetFallback>
  );
}
