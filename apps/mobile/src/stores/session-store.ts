import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ClientSessionResponse } from "@/api/types";
import { getDefaultRelayUrl, normalizeRelayUrl } from "@/lib/relay-url";

type SessionState = {
  /** True after bootstrap finished checking SecureStore. */
  deviceCredentialLoaded: boolean;
  /** True when a Hub device credential is present locally. */
  hasDeviceCredential: boolean;
  relayUrl: string;
  relaySecretKey: string;
  relayAuthRevision: number;
  selectedServerId: string | null;
  activeClientSession: ClientSessionResponse | null;
  /** True after the persisted Computer choice has been read. */
  sessionHydrated: boolean;
  setDeviceCredentialLoaded: (hasDeviceCredential: boolean) => void;
  setRelayUrl: (url: string) => void;
  setRelaySecretKey: (secretKey: string) => void;
  selectServer: (serverId: string | null) => void;
  /** Remember the Computer and its session together, without clearing the session in between. */
  adoptComputerSession: (serverId: string, session: ClientSessionResponse) => void;
  setClientSession: (session: ClientSessionResponse | null) => void;
  clearClientSession: () => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      deviceCredentialLoaded: false,
      hasDeviceCredential: false,
      relayUrl: getDefaultRelayUrl(),
      relaySecretKey: "",
      relayAuthRevision: 0,
      selectedServerId: null,
      activeClientSession: null,
      sessionHydrated: false,
      setDeviceCredentialLoaded: (hasDeviceCredential) =>
        set({
          deviceCredentialLoaded: true,
          hasDeviceCredential,
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
      adoptComputerSession: (selectedServerId, activeClientSession) =>
        set({
          selectedServerId,
          activeClientSession,
        }),
      setClientSession: (activeClientSession) => set({ activeClientSession }),
      clearClientSession: () =>
        set({
          selectedServerId: null,
          activeClientSession: null,
        }),
      clearSession: () =>
        set({
          deviceCredentialLoaded: true,
          hasDeviceCredential: false,
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
      onRehydrateStorage: () => () => {
        useSessionStore.setState({ sessionHydrated: true });
      },
    },
  ),
);

useSessionStore.persist.onFinishHydration(() => {
  useSessionStore.setState({ sessionHydrated: true });
});
