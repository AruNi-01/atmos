import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, type NativeStackHeaderItem, useRouter } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputerRow } from "@/api/types";
import { useRelayClient } from "@/hooks/use-relay-client";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { NativeButton } from "@/ui/primitives/native-controls";
import { RefreshIcon } from "@/ui/icons/lucide-native";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function ComputerConnectScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const queryClient = useQueryClient();
  const relayClient = useRelayClient();
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const hasDeviceCredential = useSessionStore(
    (state) => state.hasDeviceCredential,
  );
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);

  const computersQuery = useQuery({
    queryKey: ["computers", relayUrl, relayAuthRevision],
    enabled: hasDeviceCredential,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await relayClient.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
  });

  const connect = useMutation({
    mutationFn: async (serverId: string) => {
      const token = requireDeviceCredential();
      return relayClient
        .withDeviceCredential(token)
        .createClientSession(serverId, { clientKind: "mobile" });
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      void queryClient.invalidateQueries({ queryKey: ["workspace-bootstrap"] });
      closeRoute(router);
    },
  });

  const activeComputers = (computersQuery.data ?? []).filter((computer) => !computer.revoked);
  const error =
    computersQuery.error instanceof Error
      ? computersQuery.error.message
      : connect.error instanceof Error
        ? connect.error.message
        : null;

  return (
    <>
      <AppScreen surface="sheet">
        {!hasDeviceCredential ? (
          <Section>
            <View style={styles.emptyBlock}>
              <EmptyState
                title="Sign in required"
                message="Sign in or scan a Desktop/Web pair QR before loading Computers."
              />
              <NativeButton label="Sign in / Scan QR" onPress={() => router.replace("/onboarding")} />
            </View>
          </Section>
        ) : activeComputers.length === 0 ? (
          <Section>
            <View style={styles.emptyBlock}>
              <EmptyState
                title={computersQuery.isFetching ? "Loading Computers" : "No Computers"}
                message="Start Atmos Server, then refresh this list."
              />
            </View>
          </Section>
        ) : (
          <Section label={`${activeComputers.length} Computers`}>
            <View>
              {activeComputers.map((computer, index) => (
                <View key={computer.server_id}>
                  <ComputerRowItem
                    computer={computer}
                    isConnecting={connect.isPending}
                    isSelected={computer.server_id === selectedServerId}
                    onPress={() => connect.mutate(computer.server_id)}
                  />
                  {index < activeComputers.length - 1 ? <Separator /> : null}
                </View>
              ))}
            </View>
          </Section>
        )}
        <InlineError message={error} />
      </AppScreen>
      <Stack.Screen
        options={{
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <HeaderIconButton
                    accessibilityLabel="Refresh Computers"
                    disabled={!hasDeviceCredential || computersQuery.isFetching}
                    onPress={() => void computersQuery.refetch()}
                  />
                ),
          unstable_headerRightItems:
            Platform.OS === "ios"
              ? () =>
                  buildHeaderRightItems({
                    disabled: !hasDeviceCredential || computersQuery.isFetching,
                    onRefresh: () => void computersQuery.refetch(),
                    tintColor: theme.colors.label,
                  })
              : undefined,
        }}
      />
    </>
  );
}

function buildHeaderRightItems({
  disabled,
  onRefresh,
  tintColor,
}: {
  disabled: boolean;
  onRefresh: () => void;
  tintColor: string;
}): NativeStackHeaderItem[] {
  return [
    {
      accessibilityLabel: "Refresh Computers",
      disabled,
      icon: sfSymbol("arrow.clockwise"),
      identifier: "computer-connect-refresh",
      label: "Refresh",
      onPress: onRefresh,
      tintColor,
      type: "button",
      variant: "plain",
    },
  ];
}

function HeaderIconButton({
  accessibilityLabel,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={12}
      onPress={disabled ? undefined : onPress}
      style={[styles.headerIconButton, disabled ? styles.headerIconButtonDisabled : null]}
    >
      <RefreshIcon color={theme.colors.label} size={21} strokeWidth={2.4} />
    </Pressable>
  );
}

function sfSymbol(name: SFSymbol) {
  return { name, type: "sfSymbol" as const };
}

function ComputerRowItem({
  computer,
  isConnecting,
  isSelected,
  onPress,
}: {
  computer: ComputerRow;
  isConnecting?: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  const disabled = !computer.online || isConnecting;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.computerRow,
        disabled && styles.computerRowDisabled,
        pressed ? { backgroundColor: theme.colors.mutedPressed } : null,
      ]}
    >
      <View style={styles.computerText}>
        <Text style={[styles.computerTitle, { color: theme.colors.label }]} numberOfLines={1}>
          {computer.display_name ?? computer.server_id}
        </Text>
        <Text style={[styles.computerMeta, { color: theme.colors.secondaryLabel }]} numberOfLines={1}>
          {computer.server_id}
        </Text>
      </View>
      <View
        style={[
          styles.computerStatus,
          {
            borderColor: computer.online ? theme.colors.label : theme.colors.separatorStrong,
            backgroundColor: computer.online ? theme.colors.label : "transparent",
          },
        ]}
      >
        <Text
          style={[
            styles.computerStatusText,
            { color: computer.online ? theme.colors.labelInverse : theme.colors.secondaryLabel },
          ]}
        >
          {isSelected ? "Selected" : computer.online ? "Online" : "Offline"}
        </Text>
      </View>
    </Pressable>
  );
}

function closeRoute(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace("/");
}

const styles = StyleSheet.create({
  computerMeta: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  computerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  computerRowDisabled: {
    opacity: 0.46,
  },
  computerStatus: {
    borderColor: colors.separatorStrong,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  computerStatusOnline: {
    backgroundColor: colors.label,
    borderColor: colors.label,
  },
  computerStatusText: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  computerStatusTextOnline: {
    color: colors.labelInverse,
  },
  computerText: {
    flex: 1,
  },
  computerTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyBlock: {
    gap: 12,
    padding: 16,
  },
  headerIconButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 42,
  },
  headerIconButtonDisabled: {
    opacity: 0.42,
  },
});
