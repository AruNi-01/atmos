/**
 * APP-016 — persisted Atmos Computer / relay connectivity (browser only).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AtmosComputerConnectionMode = 'local' | 'relay';

export interface ComputerRow {
  server_id: string;
  display_name: string | null;
  revoked: number;
  created_at: number;
  last_seen_at?: number | null;
  online?: boolean;
}

interface AtmosComputerStore {
  connectionMode: AtmosComputerConnectionMode;
  /** HTTPS origin of Workers control plane, e.g. https://relay.atmos.land */
  controlPlaneUrl: string;
  /** User-owned access token (Bearer); never sent to VPS. */
  accessToken: string;
  computers: ComputerRow[];
  selectedServerId: string | null;
  /** Fully qualified client WebSocket URL from `client_sessions`. */
  relayWebSocketUrl: string | null;
  /** HTTP gateway base, e.g. https://relay…/v1/computers/{id}/proxy */
  relayGatewayHttpBase: string | null;
  /** Short-lived token for relay WS + HTTP gateway (not the user access token). */
  relayClientToken: string | null;
  registerCommandShown: string | null;
  registerTokenExpiresAt: number | null;
  setConnectionMode: (m: AtmosComputerConnectionMode) => void;
  setControlPlaneUrl: (url: string) => void;
  setAccessToken: (s: string) => void;
  setComputers: (rows: ComputerRow[]) => void;
  setSelectedServerId: (id: string | null) => void;
  setRelayWebSocketUrl: (url: string | null) => void;
  setRelayGatewayHttpBase: (url: string | null) => void;
  setRelayClientToken: (token: string | null) => void;
  setRegisterCommandShown: (cmd: string | null) => void;
  setRegisterTokenExpiresAt: (ts: number | null) => void;
  resetRelaySession: () => void;
}

const envCp =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ATMOS_CP_URL ?? '' : '';

export const useAtmosComputerStore = create(
  persist<AtmosComputerStore>(
    set => ({
      connectionMode: 'local',
      controlPlaneUrl: envCp,
      accessToken: '',
      computers: [],
      selectedServerId: null,
      relayWebSocketUrl: null,
      relayGatewayHttpBase: null,
      relayClientToken: null,
      registerCommandShown: null,
      registerTokenExpiresAt: null,

      setConnectionMode: connectionMode => set({ connectionMode }),
      setControlPlaneUrl: controlPlaneUrl => set({ controlPlaneUrl }),
      setAccessToken: accessToken => set({ accessToken }),
      setComputers: computers => set({ computers }),
      setSelectedServerId: selectedServerId => set({ selectedServerId }),
      setRelayWebSocketUrl: relayWebSocketUrl => set({ relayWebSocketUrl }),
      setRelayGatewayHttpBase: relayGatewayHttpBase => set({ relayGatewayHttpBase }),
      setRelayClientToken: relayClientToken => set({ relayClientToken }),
      setRegisterCommandShown: registerCommandShown => set({ registerCommandShown }),
      setRegisterTokenExpiresAt: registerTokenExpiresAt =>
        set({ registerTokenExpiresAt }),

      resetRelaySession: () =>
        set({
          relayWebSocketUrl: null,
          relayGatewayHttpBase: null,
          relayClientToken: null,
          registerCommandShown: null,
          registerTokenExpiresAt: null,
          selectedServerId: null,
        }),
    }),
    {
      name: 'atmos-computer',
      version: 4,
      migrate: (persisted, version) => {
        const state = { ...(persisted as object) } as Record<string, unknown>;
        if (version < 2) {
          delete state.pairingCodeShown;
        }
        if (version < 3) {
          if (typeof state.bearerSecret === 'string' && !state.accessToken) {
            state.accessToken = state.bearerSecret;
          }
          delete state.bearerSecret;
        }
        if (version < 4) {
          state.relayGatewayHttpBase = null;
          state.relayClientToken = null;
        }
        return state as unknown as AtmosComputerStore;
      },
    },
  ),
);

export function normalizedControlPlaneOrigin(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  return t.startsWith('http') ? t : `https://${t}`;
}
