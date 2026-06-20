import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ClientSessionResponse } from "@/api/types";
import { getDefaultControlPlaneUrl, normalizeRelayUrl } from "@/lib/relay-url";

type SessionState = {
  accessTokenLoaded: boolean;
  hasAccessToken: boolean;
  controlPlaneUrl: string;
  selectedServerId: string | null;
  activeClientSession: ClientSessionResponse | null;
  setAccessTokenLoaded: (hasAccessToken: boolean) => void;
  setControlPlaneUrl: (url: string) => void;
  selectServer: (serverId: string | null) => void;
  setClientSession: (session: ClientSessionResponse | null) => void;
  clearClientSession: () => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessTokenLoaded: false,
      hasAccessToken: false,
      controlPlaneUrl: getDefaultControlPlaneUrl(),
      selectedServerId: null,
      activeClientSession: null,
      setAccessTokenLoaded: (hasAccessToken) =>
        set({
          accessTokenLoaded: true,
          hasAccessToken,
        }),
      setControlPlaneUrl: (url) =>
        set({
          controlPlaneUrl: normalizeRelayUrl(url),
        }),
      selectServer: (serverId) =>
        set({
          selectedServerId: serverId,
          activeClientSession: null,
        }),
      setClientSession: (activeClientSession) => set({ activeClientSession }),
      clearClientSession: () =>
        set({
          selectedServerId: null,
          activeClientSession: null,
        }),
      clearSession: () =>
        set({
          accessTokenLoaded: true,
          hasAccessToken: false,
          selectedServerId: null,
          activeClientSession: null,
        }),
    }),
    {
      name: "atmos.mobile.session",
      partialize: (state) => ({
        controlPlaneUrl: state.controlPlaneUrl,
        selectedServerId: state.selectedServerId,
      }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
