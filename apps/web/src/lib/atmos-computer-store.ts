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
  /** Friendly name for this browser's machine (pre-register + UI). */
  localComputerDisplayName: string;
  /** Cached `server_id` from local API after register. */
  localServerId: string | null;
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
  setLocalComputerDisplayName: (name: string) => void;
  setLocalServerId: (id: string | null) => void;
  resetRelaySession: () => void;
}

const envCp =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ATMOS_CP_URL ?? '' : '';

/** Production relay; override via `NEXT_PUBLIC_ATMOS_CP_URL` at build time only. */
export const DEFAULT_CONTROL_PLANE_URL = 'https://relay.atmos.land';

export function resolveControlPlaneUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed) {
    return normalizedControlPlaneOrigin(trimmed);
  }
  if (envCp.trim()) {
    return normalizedControlPlaneOrigin(envCp);
  }
  return DEFAULT_CONTROL_PLANE_URL;
}

export const useAtmosComputerStore = create(
  persist<AtmosComputerStore>(
    set => ({
      connectionMode: 'local',
      controlPlaneUrl: envCp || DEFAULT_CONTROL_PLANE_URL,
      accessToken: '',
      computers: [],
      selectedServerId: null,
      relayWebSocketUrl: null,
      relayGatewayHttpBase: null,
      relayClientToken: null,
      registerCommandShown: null,
      registerTokenExpiresAt: null,
      localComputerDisplayName: '',
      localServerId: null,

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
      setLocalComputerDisplayName: localComputerDisplayName =>
        set({ localComputerDisplayName }),
      setLocalServerId: localServerId => set({ localServerId }),

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
      version: 5,
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
        if (version < 5) {
          state.localComputerDisplayName = '';
          state.localServerId = null;
        }
        return state as unknown as AtmosComputerStore;
      },
    },
  ),
);

export function normalizedControlPlaneOrigin(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) {
    return '';
  }
  return t.startsWith('http') ? t : `https://${t}`;
}
