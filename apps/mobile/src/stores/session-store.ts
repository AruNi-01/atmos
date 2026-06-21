import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ClientSessionResponse } from "@/api/types";
import { getDefaultRelayUrl, normalizeRelayUrl } from "@/lib/relay-url";

type SessionState = {
  accessTokenLoaded: boolean;
  hasAccessToken: boolean;
  relayUrl: string;
  relaySecretKey: string;
  relayAuthRevision: number;
  selectedServerId: string | null;
  activeClientSession: ClientSessionResponse | null;
  setAccessTokenLoaded: (hasAccessToken: boolean) => void;
  setRelayUrl: (url: string) => void;
  setRelaySecretKey: (secretKey: string) => void;
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
      relayUrl: getDefaultRelayUrl(),
      relaySecretKey: "",
      relayAuthRevision: 0,
      selectedServerId: null,
      activeClientSession: null,
      setAccessTokenLoaded: (hasAccessToken) =>
        set({
          accessTokenLoaded: true,
          hasAccessToken,
        }),
      setRelayUrl: (url) =>
        set({
          relayUrl: normalizeRelayUrl(url),
        }),
      setRelaySecretKey: (relaySecretKey) =>
        set((state) => {
          const nextRelaySecretKey = relaySecretKey.trim();
          if (state.relaySecretKey === nextRelaySecretKey) {
            return {};
          }

          return {
            relaySecretKey: nextRelaySecretKey,
            relayAuthRevision: state.relayAuthRevision + 1,
          };
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
        relayUrl: state.relayUrl,
        selectedServerId: state.selectedServerId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SessionState> | null;
        return {
          ...current,
          relayUrl:
            typeof persistedState?.relayUrl === "string"
              ? normalizeRelayUrl(persistedState.relayUrl)
              : current.relayUrl,
          selectedServerId:
            typeof persistedState?.selectedServerId === "string"
              ? persistedState.selectedServerId
              : null,
        };
      },
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
