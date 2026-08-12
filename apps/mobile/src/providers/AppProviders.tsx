import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { AppState, Appearance } from "react-native";
import * as Network from "expo-network";
import * as SystemUI from "expo-system-ui";
import { QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { createAtmosQueryClient } from "@/providers/query-client";
import { MobileWsProvider } from "@/providers/MobileWsProvider";
import { acceptDeviceCredential, hasDeviceCredential } from "@/lib/device-credential";
import {
  isDevDeviceImportEnabled,
  loadDevDeviceImport,
} from "@/lib/dev-device-import";
import { ensureMobileHubConfigured } from "@/lib/hub-config";
import {
  clearRelaySecretKey,
  getStoredRelaySecretKey,
  storeRelaySecretKey,
} from "@/lib/relay-secret-key";
import { useSessionStore } from "@/stores/session-store";
import { MobileThemeVariablesProvider } from "@/providers/MobileThemeVariablesProvider";
import { useMobileTheme } from "@/theme/theme-store";

export function AppProviders({ children }: PropsWithChildren) {
  const theme = useMobileTheme();
  const queryClient = useMemo(() => createAtmosQueryClient(), []);
  const setDeviceCredentialLoaded = useSessionStore(
    (state) => state.setDeviceCredentialLoaded,
  );
  const setRelayUrl = useSessionStore((state) => state.setRelayUrl);
  const setRelaySecretKey = useSessionStore((state) => state.setRelaySecretKey);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await ensureMobileHubConfigured();

      if (hasDeviceCredential()) {
        setRelaySecretKey((await getStoredRelaySecretKey()) ?? "");
        if (!cancelled) setDeviceCredentialLoaded(true);
        return;
      }

      if (isDevDeviceImportEnabled()) {
        const imported = await loadDevDeviceImport();
        if (imported) {
          await acceptDeviceCredential({
            device_id: imported.deviceId,
            device_credential: imported.deviceCredential,
          });
          if (imported.relayUrl) {
            setRelayUrl(imported.relayUrl);
          }
          if (imported.relaySecretKey) {
            await storeRelaySecretKey(imported.relaySecretKey);
            setRelaySecretKey(imported.relaySecretKey);
          } else {
            await clearRelaySecretKey();
            setRelaySecretKey("");
          }
          if (!cancelled) setDeviceCredentialLoaded(true);
          return;
        }
      }

      await clearRelaySecretKey();
      setRelaySecretKey("");
      if (!cancelled) setDeviceCredentialLoaded(false);
    };

    void bootstrap().catch(() => {
      if (!cancelled) setDeviceCredentialLoaded(false);
    });

    return () => {
      cancelled = true;
    };
  }, [setDeviceCredentialLoaded, setRelayUrl, setRelaySecretKey]);

  useEffect(() => {
    Appearance.setColorScheme(
      theme.preference === "system" ? "unspecified" : theme.preference,
    );
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background, theme.preference]);

  useEffect(() => {
    const updateNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      onlineManager.setOnline(state.isConnected ?? true);
    };

    void updateNetwork();
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
      if (status === "active") void updateNetwork();
    });

    return () => subscription.remove();
  }, []);

  return (
    <MobileThemeVariablesProvider>
      <QueryClientProvider client={queryClient}>
        <MobileWsProvider>{children}</MobileWsProvider>
      </QueryClientProvider>
    </MobileThemeVariablesProvider>
  );
}
