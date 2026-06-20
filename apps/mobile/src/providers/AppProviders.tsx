import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import * as SystemUI from "expo-system-ui";
import { QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { createAtmosQueryClient } from "@/providers/query-client";
import { MobileWsProvider } from "@/providers/MobileWsProvider";
import { getStoredAccessToken, storeAccessToken } from "@/lib/access-token";
import { loadDevAccessTokenImport } from "@/lib/dev-access-token-import";
import { useSessionStore } from "@/stores/session-store";
import { colors } from "@/theme/colors";

export function AppProviders({ children }: PropsWithChildren) {
  const queryClient = useMemo(() => createAtmosQueryClient(), []);
  const setAccessTokenLoaded = useSessionStore((state) => state.setAccessTokenLoaded);
  const setControlPlaneUrl = useSessionStore((state) => state.setControlPlaneUrl);

  useEffect(() => {
    let cancelled = false;

    const loadAccessToken = async () => {
      const storedToken = await getStoredAccessToken();
      if (storedToken) {
        if (!cancelled) setAccessTokenLoaded(true);
        return;
      }

      const imported = await loadDevAccessTokenImport();
      if (imported) {
        await storeAccessToken(imported.accessToken);
        if (imported.controlPlaneUrl) {
          setControlPlaneUrl(imported.controlPlaneUrl);
        }
        if (!cancelled) setAccessTokenLoaded(true);
        return;
      }

      if (!cancelled) setAccessTokenLoaded(false);
    };

    void loadAccessToken().catch(() => {
      if (!cancelled) setAccessTokenLoaded(false);
    });

    return () => {
      cancelled = true;
    };
  }, [setAccessTokenLoaded, setControlPlaneUrl]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

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
