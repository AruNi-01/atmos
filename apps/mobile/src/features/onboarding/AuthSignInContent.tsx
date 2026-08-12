import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { ComputerPicker } from "@/features/computers/ComputerPicker";
import { PairQrScanner } from "@/features/onboarding/PairQrScanner";
import { useAuthSignIn } from "@/features/onboarding/use-auth-sign-in";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { TerminalIcon } from "@/ui/icons/lucide-native";

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

export type AuthSignInContentProps = {
  initialScannerOpen?: boolean;
  onAuthenticated?: () => void;
  surface?: "screen" | "sheet";
};

export function AuthSignInContent({
  initialScannerOpen = false,
  onAuthenticated,
  surface = "screen",
}: AuthSignInContentProps) {
  const theme = useMobileTheme();
  const auth = useAuthSignIn({ onAuthenticated });
  const [scannerOpen, setScannerOpen] = useState(initialScannerOpen);

  useEffect(() => {
    if (initialScannerOpen) {
      setScannerOpen(true);
    }
  }, [initialScannerOpen]);

  const footer = auth.hasDeviceCredential ? (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={auth.busy ? theme.colors.tertiaryLabel : theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={auth.busy}
        label={auth.computersQuery.isFetching ? "Checking Computers..." : "Refresh Computers"}
        onPress={(auth.busy) ? undefined : (() => {
        if (!auth.computersQuery.isFetching) void auth.computersQuery.refetch();
      })}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: auth.busy ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
  ) : (
    <View className="w-full gap-action-row-gap">
      <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={auth.busy ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={auth.busy}
        label={auth.signIn.isPending ? "Signing in..." : "Continue with GitHub"}
        onPress={(auth.busy) ? undefined : (() => auth.signIn.mutate("github"))}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: auth.busy ? theme.colors.controlDisabled : theme.colors.ctaFill,
      borderRadius: radii.control,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="filled"
      />
    </Host>
      <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={auth.busy ? theme.colors.tertiaryLabel : theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={auth.busy}
        label={auth.signIn.isPending ? "Signing in..." : "Continue with Google"}
        onPress={(auth.busy) ? undefined : (() => auth.signIn.mutate("google"))}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: auth.busy ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
    </View>
  );

  return (
    <AppScreen footer={footer} surface={surface}>
      <View className="items-center gap-3 px-2 pb-2 pt-4">
        <View
          className="h-14 w-14 items-center justify-center"
          style={{
            backgroundColor: theme.colors.ctaFill,
            borderRadius: radii.iconWell + 2,
          }}
        >
          <TerminalIcon
            color={theme.colors.ctaLabel}
            size={28}
            strokeWidth={2.2}
          />
        </View>
        <Text className="max-w-[320px] text-center text-secondary-label text-hero-subtitle leading-hero-subtitle">
          Sign in with GitHub or Google. Or scan a temporary QR from Desktop/Web
          — no paste, no shared secrets.
        </Text>
      </View>

      {!auth.hasDeviceCredential ? (
        <Section label="Or scan QR">
          <View className="gap-3 p-card-padding">
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={auth.busy ? theme.colors.tertiaryLabel : theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={auth.busy}
        label={scannerOpen ? "Close scanner" : "Scan pair QR from Desktop/Web"}
        onPress={(auth.busy) ? undefined : (() => {
                auth.setLocalError(null);
                setScannerOpen((open) => !open);
              })}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: auth.busy ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
            <Text
              selectable
              className="text-secondary-label text-body-small leading-body-small"
            >
              On Desktop/Web: Atmos Computer → Pair phone. Code expires in 3
              minutes and is one-time use.
            </Text>
            {scannerOpen ? (
              <PairQrScanner
                disabled={auth.busy}
                onScanned={(value) => {
                  setScannerOpen(false);
                  auth.claimPair.mutate(value);
                }}
              />
            ) : null}
          </View>
        </Section>
      ) : (
        <Section label="Account">
          <View className="flex-row items-center gap-2.5 px-card-padding py-4">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: theme.colors.green }}
            />
            <Text className="flex-1 text-secondary-label text-body leading-body">
              This phone is signed in
            </Text>
          </View>
        </Section>
      )}

      {auth.hasDeviceCredential ? (
        <ComputerPicker
          computers={auth.computersQuery.data ?? []}
          selectedServerId={auth.selectedServerId}
          onRefresh={() => void auth.computersQuery.refetch()}
          isRefreshing={auth.computersQuery.isFetching}
          onSelect={(serverId) => auth.createSession.mutate(serverId)}
        />
      ) : null}

      {!auth.hasDeviceCredential ? (
        <Section label="How it works">
          <View className="gap-4 p-card-padding">
            <OnboardingStep
              title="Sign in (recommended)"
              body="GitHub or Google in the system browser. Atmos mints a device for this phone only."
            />
            <OnboardingStep
              title="Or scan QR"
              body="If you are already signed in on Desktop/Web, pair without logging in again."
            />
            <OnboardingStep
              title="Auto-connect"
              body="When a single Computer is online, Atmos opens it automatically."
            />
          </View>
        </Section>
      ) : null}

      {!auth.hasDeviceCredential ? (
        <Text
          selectable
          className="px-1 text-secondary-label text-body-small leading-body-small"
        >
          Opens the system browser. After OAuth, this phone receives a Hub device
          credential and connects when a Computer is online.
        </Text>
      ) : null}

      <InlineError
        message={
          auth.localError ??
          (auth.computersQuery.error instanceof Error
            ? auth.computersQuery.error.message
            : auth.createSession.error instanceof Error
              ? auth.createSession.error.message
              : null)
        }
      />
    </AppScreen>
  );
}

function OnboardingStep({ body, title }: { body: string; title: string }) {
  return (
    <View className="gap-1">
      <Text className="font-semibold text-label text-row-title leading-row-title">
        {title}
      </Text>
      <Text className="text-secondary-label text-body-small leading-body-small">
        {body}
      </Text>
    </View>
  );
}
