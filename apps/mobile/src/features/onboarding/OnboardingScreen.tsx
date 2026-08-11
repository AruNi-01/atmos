import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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

  return (
    <AppScreen
      footer={
        hasDeviceCredential ? (
          <NativeButton
            label={
              computersQuery.isFetching
                ? "Checking Computers..."
                : "Refresh Computers"
            }
            onPress={() => {
              if (!computersQuery.isFetching) void computersQuery.refetch();
            }}
            disabled={busy}
          />
        ) : null
      }
    >
      <View style={styles.hero}>
        <View
          style={[styles.heroMark, { backgroundColor: theme.colors.label }]}
        >
          <TerminalIcon
            color={theme.colors.labelInverse}
            size={28}
            strokeWidth={2.2}
          />
        </View>
        <Text style={[styles.heroTitle, { color: theme.colors.label }]}>
          Connect Atmos
        </Text>
        <Text
          style={[styles.heroSubtitle, { color: theme.colors.secondaryLabel }]}
        >
          Sign in with GitHub or Google. Or scan a temporary QR from Desktop/Web
          — no paste, no shared secrets.
        </Text>
      </View>

      {!hasDeviceCredential ? (
        <>
          <Section label="Sign in">
            <View style={styles.formBlock}>
              <NativeButton
                label={
                  signIn.isPending ? "Signing in..." : "Continue with GitHub"
                }
                onPress={() => signIn.mutate("github")}
                disabled={busy}
              />
              <NativeButton
                label={
                  signIn.isPending ? "Signing in..." : "Continue with Google"
                }
                onPress={() => signIn.mutate("google")}
                disabled={busy}
              />
              <Text
                selectable
                style={[
                  styles.bodyText,
                  { color: theme.colors.secondaryLabel },
                ]}
              >
                Opens the system browser. After OAuth, this phone receives a Hub
                device credential and connects when a Computer is online.
              </Text>
            </View>
          </Section>

          <Section label="Or scan QR">
            <View style={styles.formBlock}>
              <NativeButton
                label={
                  scannerOpen
                    ? "Close scanner"
                    : "Scan pair QR from Desktop/Web"
                }
                onPress={() => {
                  setLocalError(null);
                  setScannerOpen((open) => !open);
                }}
                disabled={busy}
              />
              <Text
                selectable
                style={[
                  styles.bodyText,
                  { color: theme.colors.secondaryLabel },
                ]}
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
        </>
      ) : (
        <Section label="Account">
          <View style={styles.tokenSummary}>
            <View
              style={[styles.statusDot, { backgroundColor: theme.colors.label }]}
            />
            <Text
              style={[styles.statusText, { color: theme.colors.secondaryLabel }]}
            >
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
          <View style={styles.steps}>
            <Step
              index="1"
              title="Sign in (recommended)"
              body="GitHub or Google in the system browser. Atmos mints a device for this phone only."
            />
            <Step
              index="2"
              title="Or scan QR"
              body="If you are already signed in on Desktop/Web, pair without logging in again."
            />
            <Step
              index="3"
              title="Auto-connect"
              body="When a single Computer is online, Atmos opens it automatically."
            />
          </View>
        </Section>
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

function Step({
  body,
  index,
  title,
}: {
  body: string;
  index: string;
  title: string;
}) {
  const theme = useMobileTheme();
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepIndex, { backgroundColor: theme.colors.label }]}>
        <Text
          style={[styles.stepIndexText, { color: theme.colors.labelInverse }]}
        >
          {index}
        </Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, { color: theme.colors.label }]}>
          {title}
        </Text>
        <Text style={[styles.stepBody, { color: theme.colors.secondaryLabel }]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 10,
    paddingBottom: 8,
  },
  heroMark: {
    alignItems: "center",
    borderRadius: 18,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  formBlock: {
    gap: 12,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  tokenSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  steps: {
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
  },
  stepIndex: {
    alignItems: "center",
    borderRadius: 12,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepIndexText: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  stepBody: {
    fontSize: 13,
    lineHeight: 19,
  },
});
