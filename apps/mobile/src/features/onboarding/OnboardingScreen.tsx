import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton } from "@/ui/primitives/native-controls";
import { TerminalIcon } from "@/ui/icons/lucide-native";
import { ComputerPicker } from "@/features/computers/ComputerPicker";
import { PairQrScanner } from "@/features/onboarding/PairQrScanner";
import { useRelayClient } from "@/hooks/use-relay-client";
import { autoConnectAfterAuth } from "@/lib/auto-connect";
import { requireDeviceCredential } from "@/lib/device-credential";
import {
  signInWithHubProvider,
  type HubSocialProvider,
} from "@/lib/hub-auth-native";
import { claimPairFromScan } from "@/lib/mobile-pair-claim";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export function OnboardingScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const client = useRelayClient();
  const setDeviceCredentialLoaded = useSessionStore(
    (state) => state.setDeviceCredentialLoaded,
  );
  const hasDeviceCredential = useSessionStore(
    (state) => state.hasDeviceCredential,
  );
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [localError, setLocalError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const finishAuth = useCallback(async () => {
    setDeviceCredentialLoaded(true);
    const result = await autoConnectAfterAuth(client);
    setComputers(result.computers);
    setLocalError(null);
    if (result.connectedServerId) {
      router.replace("/");
    }
  }, [client, router, setComputers, setDeviceCredentialLoaded]);

  const signIn = useMutation({
    mutationFn: async (provider: HubSocialProvider) => {
      await signInWithHubProvider(provider);
      await finishAuth();
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Sign-in failed.");
    },
  });

  const claimPair = useMutation({
    mutationFn: async (raw: string) => {
      await claimPairFromScan(raw);
      await finishAuth();
    },
    onError: (error) => {
      setLocalError(
        error instanceof Error ? error.message : "Could not claim pair code.",
      );
    },
  });

  const computersQuery = useQuery({
    queryKey: [
      "onboarding-computers",
      relayUrl,
      relayAuthRevision,
      hasDeviceCredential,
    ],
    enabled: hasDeviceCredential,
    refetchInterval: 5000,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await client.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
  });

  const createSession = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return client
        .withDeviceCredential(token)
        .createClientSession(serverId, { clientKind: "mobile" });
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      setLocalError(null);
      router.replace("/");
    },
    onError: (error) => {
      setLocalError(
        error instanceof Error ? error.message : "Could not connect to Computer.",
      );
    },
  });

  const busy =
    signIn.isPending || claimPair.isPending || createSession.isPending;

  const footer = hasDeviceCredential ? (
    <NativeButton
      label={
        computersQuery.isFetching ? "Checking Computers..." : "Refresh Computers"
      }
      onPress={() => {
        if (!computersQuery.isFetching) void computersQuery.refetch();
      }}
      disabled={busy}
    />
  ) : (
    <View className="gap-action-row-gap">
      <NativeButton
        label={signIn.isPending ? "Signing in..." : "Continue with GitHub"}
        onPress={() => signIn.mutate("github")}
        disabled={busy}
      />
      <NativeButton
        label={signIn.isPending ? "Signing in..." : "Continue with Google"}
        onPress={() => signIn.mutate("google")}
        disabled={busy}
        surface="control"
        tone="secondary"
      />
    </View>
  );

  return (
    <AppScreen footer={footer}>
      <View className="items-center gap-3 px-2 pb-2 pt-4">
        <View
          className="h-14 w-14 items-center justify-center"
          style={{
            backgroundColor: theme.colors.label,
            borderRadius: radii.iconWell + 2,
          }}
        >
          <TerminalIcon
            color={theme.colors.labelInverse}
            size={28}
            strokeWidth={2.2}
          />
        </View>
        <Text
          className="text-center text-label"
          style={typography.heroTitle}
        >
          Connect Atmos
        </Text>
        <Text
          className="max-w-[320px] text-center text-secondary-label"
          style={typography.heroSubtitle}
        >
          Sign in with GitHub or Google. Or scan a temporary QR from Desktop/Web
          — no paste, no shared secrets.
        </Text>
      </View>

      {!hasDeviceCredential ? (
        <Section label="Or scan QR">
          <View className="gap-3 p-card-padding">
            <NativeButton
              label={
                scannerOpen ? "Close scanner" : "Scan pair QR from Desktop/Web"
              }
              onPress={() => {
                setLocalError(null);
                setScannerOpen((open) => !open);
              }}
              disabled={busy}
              surface="control"
              tone="text"
            />
            <Text
              selectable
              className="text-secondary-label"
              style={typography.bodySmall}
            >
              On Desktop/Web: Atmos Computer → Pair phone. Code expires in 3
              minutes and is one-time use.
            </Text>
            {scannerOpen ? (
              <PairQrScanner
                disabled={busy}
                onScanned={(value) => {
                  setScannerOpen(false);
                  claimPair.mutate(value);
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
            <Text className="flex-1 text-secondary-label" style={typography.body}>
              This phone is signed in
            </Text>
          </View>
        </Section>
      )}

      {hasDeviceCredential ? (
        <ComputerPicker
          computers={computersQuery.data ?? []}
          selectedServerId={selectedServerId}
          onRefresh={() => void computersQuery.refetch()}
          isRefreshing={computersQuery.isFetching}
          onSelect={(serverId) => createSession.mutate(serverId)}
        />
      ) : null}

      {!hasDeviceCredential ? (
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

      {!hasDeviceCredential ? (
        <Text
          selectable
          className="px-1 text-secondary-label"
          style={typography.bodySmall}
        >
          Opens the system browser. After OAuth, this phone receives a Hub device
          credential and connects when a Computer is online.
        </Text>
      ) : null}

      <InlineError
        message={
          localError ??
          (computersQuery.error instanceof Error
            ? computersQuery.error.message
            : createSession.error instanceof Error
              ? createSession.error.message
              : null)
        }
      />
    </AppScreen>
  );
}

function OnboardingStep({ body, title }: { body: string; title: string }) {
  return (
    <View className="gap-1">
      <Text className="text-label" style={typography.rowTitle}>
        {title}
      </Text>
      <Text className="text-secondary-label" style={typography.bodySmall}>
        {body}
      </Text>
    </View>
  );
}
