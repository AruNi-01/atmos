import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { AppState, Appearance } from "react-native";
import * as Network from "expo-network";
import * as SystemUI from "expo-system-ui";
import { QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { createAtmosQueryClient } from "@/providers/query-client";
import { MobileWsProvider } from "@/providers/MobileWsProvider";
import { getStoredAccessToken, storeAccessToken } from "@/lib/access-token";
import { loadDevAccessTokenImport } from "@/lib/dev-access-token-import";
import { clearRelaySecretKey, getStoredRelaySecretKey, storeRelaySecretKey } from "@/lib/relay-secret-key";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";

export function AppProviders({ children }: PropsWithChildren) {
  const theme = useMobileTheme();
  const queryClient = useMemo(() => createAtmosQueryClient(), []);
  const setAccessTokenLoaded = useSessionStore((state) => state.setAccessTokenLoaded);
  const setRelayUrl = useSessionStore((state) => state.setRelayUrl);
  const setRelaySecretKey = useSessionStore((state) => state.setRelaySecretKey);

  useEffect(() => {
    let cancelled = false;

    const loadAccessToken = async () => {
      const storedToken = await getStoredAccessToken();
      if (storedToken) {
        setRelaySecretKey((await getStoredRelaySecretKey()) ?? "");
        if (!cancelled) setAccessTokenLoaded(true);
        return;
      }

      const imported = await loadDevAccessTokenImport();
      if (imported) {
        await storeAccessToken(imported.accessToken);
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
        if (!cancelled) setAccessTokenLoaded(true);
        return;
      }

      await clearRelaySecretKey();
      setRelaySecretKey("");
      if (!cancelled) setAccessTokenLoaded(false);
    };

    void loadAccessToken().catch(() => {
      if (!cancelled) setAccessTokenLoaded(false);
    });

    return () => {
      cancelled = true;
    };
  }, [setAccessTokenLoaded, setRelayUrl, setRelaySecretKey]);

  useEffect(() => {
    Appearance.setColorScheme(theme.preference === "system" ? "unspecified" : theme.preference);
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
    <QueryClientProvider client={queryClient}>
      <MobileWsProvider>{children}</MobileWsProvider>
    </QueryClientProvider>
  );
}
