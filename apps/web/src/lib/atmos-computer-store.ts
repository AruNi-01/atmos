/**
 * APP-016 — Atmos Computer UI state.
 *
 * Access Token + control plane URL: `~/.atmos/computer-client.json` (loopback API).
 * Local connection prefs: browser `atmos:v1:inst:local:connection`.
 * Relay session fields: memory only.
 */

import { create } from 'zustand';
import { LOCAL_INSTANCE_ID } from '@/lib/connection-instance';
import {
  readConnectionUiPrefs,
  writeConnectionUiPrefs,
} from '@/lib/connection-ui-prefs';

export type AtmosComputerConnectionMode = 'local' | 'relay';

export type { ComputerRow } from '@/lib/connection-ui-prefs';
import type { ComputerRow } from '@/lib/connection-ui-prefs';

interface AtmosComputerData {
  connectionMode: AtmosComputerConnectionMode;
  controlPlaneUrl: string;
  accessToken: string;
  computers: ComputerRow[];
  selectedServerId: string | null;
  relayWebSocketUrl: string | null;
  relayGatewayHttpBase: string | null;
  relayClientToken: string | null;
  registerCommandShown: string | null;
  registerTokenExpiresAt: number | null;
  localComputerDisplayName: string;
  localServerId: string | null;
}

interface AtmosComputerStore extends AtmosComputerData {
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
  hydrateLocalConnectionPrefs: () => void;
}

const envCp =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ATMOS_CP_URL ?? '' : '';

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

function loadLocalConnectionPrefs(): Pick<
  AtmosComputerData,
  'computers' | 'selectedServerId' | 'localComputerDisplayName' | 'localServerId'
> {
  if (typeof window === 'undefined') {
    return {
      computers: [],
      selectedServerId: null,
      localComputerDisplayName: '',
      localServerId: null,
    };
  }
  const p = readConnectionUiPrefs(LOCAL_INSTANCE_ID);
  return {
    computers: p.computersCache,
    selectedServerId: p.selectedServerId,
    localComputerDisplayName: p.localComputerDisplayName,
    localServerId: p.localServerId,
  };
}

function persistLocalConnectionPrefs(
  patch: Partial<{
    computers: ComputerRow[];
    selectedServerId: string | null;
    localComputerDisplayName: string;
    localServerId: string | null;
  }>,
): void {
  const current = readConnectionUiPrefs(LOCAL_INSTANCE_ID);
  writeConnectionUiPrefs(
    {
      computersCache: patch.computers ?? current.computersCache,
      selectedServerId:
        patch.selectedServerId !== undefined
          ? patch.selectedServerId
          : current.selectedServerId,
      localComputerDisplayName:
        patch.localComputerDisplayName ?? current.localComputerDisplayName,
      localServerId:
        patch.localServerId !== undefined ? patch.localServerId : current.localServerId,
    },
    LOCAL_INSTANCE_ID,
  );
}

const localPrefs = loadLocalConnectionPrefs();

export const useAtmosComputerStore = create<AtmosComputerStore>((set, get) => ({
  connectionMode: 'local',
  controlPlaneUrl: envCp || DEFAULT_CONTROL_PLANE_URL,
  accessToken: '',
  computers: localPrefs.computers,
  selectedServerId: localPrefs.selectedServerId,
  relayWebSocketUrl: null,
  relayGatewayHttpBase: null,
  relayClientToken: null,
  registerCommandShown: null,
  registerTokenExpiresAt: null,
  localComputerDisplayName: localPrefs.localComputerDisplayName,
  localServerId: localPrefs.localServerId,

  hydrateLocalConnectionPrefs: () => {
    const p = loadLocalConnectionPrefs();
    set({
      computers: p.computers,
      selectedServerId: p.selectedServerId,
      localComputerDisplayName: p.localComputerDisplayName,
      localServerId: p.localServerId,
    });
  },

  setConnectionMode: connectionMode => set({ connectionMode }),
  setControlPlaneUrl: controlPlaneUrl => set({ controlPlaneUrl }),
  setAccessToken: accessToken => set({ accessToken }),

  setComputers: computers => {
    set({ computers });
    persistLocalConnectionPrefs({ computers });
  },

  setSelectedServerId: selectedServerId => {
    set({ selectedServerId });
    persistLocalConnectionPrefs({ selectedServerId });
  },

  setRelayWebSocketUrl: relayWebSocketUrl => set({ relayWebSocketUrl }),
  setRelayGatewayHttpBase: relayGatewayHttpBase => set({ relayGatewayHttpBase }),
  setRelayClientToken: relayClientToken => set({ relayClientToken }),
  setRegisterCommandShown: registerCommandShown => set({ registerCommandShown }),
  setRegisterTokenExpiresAt: registerTokenExpiresAt => set({ registerTokenExpiresAt }),

  setLocalComputerDisplayName: localComputerDisplayName => {
    set({ localComputerDisplayName });
    persistLocalConnectionPrefs({ localComputerDisplayName });
  },

  setLocalServerId: localServerId => {
    set({ localServerId });
    persistLocalConnectionPrefs({ localServerId });
  },

  resetRelaySession: () => {
    set({
      relayWebSocketUrl: null,
      relayGatewayHttpBase: null,
      relayClientToken: null,
      registerCommandShown: null,
      registerTokenExpiresAt: null,
    });
    get().setSelectedServerId(null);
  },
}));

export function normalizedControlPlaneOrigin(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) {
    return '';
  }
  return t.startsWith('http') ? t : `https://${t}`;
}
