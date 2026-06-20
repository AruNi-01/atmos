import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputerRow } from "@/api/types";
import { useControlPlaneClient } from "@/hooks/use-control-plane-client";
import { getStoredAccessToken } from "@/lib/access-token";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton } from "@/ui/primitives/native-controls";
import { colors, radii } from "@/theme/colors";

export function ComputerConnectScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const controlPlaneClient = useControlPlaneClient();
  const controlPlaneUrl = useSessionStore((state) => state.controlPlaneUrl);
  const hasAccessToken = useSessionStore((state) => state.hasAccessToken);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);

  const computersQuery = useQuery({
    queryKey: ["computers", controlPlaneUrl],
    enabled: hasAccessToken,
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      const computers = await controlPlaneClient.listComputers(token);
      setComputers(computers);
      return computers;
    },
  });

  const connect = useMutation({
    mutationFn: async (serverId: string) => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return controlPlaneClient.createClientSession(token, serverId);
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
      <AppScreen>
        {!hasAccessToken ? (
          <Section>
            <View style={styles.emptyBlock}>
              <EmptyState
                title="Access Token required"
                message="Connect mobile to Relay before loading Computers."
              />
              <NativeButton label="Set Access Token" onPress={() => router.replace("/onboarding")} />
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
            <View style={styles.rows}>
              {activeComputers.map((computer) => (
                <ComputerRowItem
                  computer={computer}
                  isConnecting={connect.isPending}
                  isSelected={computer.server_id === selectedServerId}
                  key={computer.server_id}
                  onPress={() => connect.mutate(computer.server_id)}
                />
              ))}
            </View>
          </Section>
        )}
        <InlineError message={error} />
      </AppScreen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <NativeButton
              disabled={!hasAccessToken || computersQuery.isFetching}
              label={computersQuery.isFetching ? "Refreshing" : "Refresh"}
              onPress={() => void computersQuery.refetch()}
              variant="text"
            />
          ),
        }}
      />
    </>
  );
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
  const disabled = !computer.online || isConnecting;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.computerRow,
        disabled && styles.computerRowDisabled,
        pressed && styles.computerRowPressed,
      ]}
    >
      <View style={styles.computerText}>
        <Text style={styles.computerTitle} numberOfLines={1}>
          {computer.display_name ?? computer.server_id}
        </Text>
        <Text style={styles.computerMeta} numberOfLines={1}>
          {computer.server_id}
        </Text>
      </View>
      <View style={[styles.computerStatus, computer.online && styles.computerStatusOnline]}>
        <Text style={[styles.computerStatusText, computer.online && styles.computerStatusTextOnline]}>
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
    backgroundColor: colors.cardElevated,
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    padding: 12,
  },
  computerRowDisabled: {
    opacity: 0.46,
  },
  computerRowPressed: {
    opacity: 0.68,
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
  rows: {
    gap: 10,
    padding: 12,
  },
});
