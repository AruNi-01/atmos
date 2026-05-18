'use client';

import { create } from 'zustand';
import type { ApiConfig } from '@/lib/desktop-runtime';
import type { LocalComputerStatus } from '@/lib/atmos-computer-local';

export type HostedConnectionTarget = 'local' | 'relay';
export type HostedBootstrapState = 'idle' | 'checking' | 'onboarding' | 'connected';
export type HostedLocalProbeState = 'idle' | 'checking' | 'available' | 'unavailable';

interface HostedConnectionState {
  enabled: boolean;
  bootstrapState: HostedBootstrapState;
  localProbeState: HostedLocalProbeState;
  localApiConfig: ApiConfig | null;
  localStatus: LocalComputerStatus | null;
  localError: string | null;
  remoteError: string | null;
  connectedTarget: HostedConnectionTarget | null;
  initialize: (enabled: boolean) => void;
  startChecking: () => void;
  setLocalAvailable: (config: ApiConfig, status: LocalComputerStatus) => void;
  setLocalUnavailable: (error: string | null) => void;
  setRemoteError: (error: string | null) => void;
  setOnboarding: () => void;
  setConnected: (target: HostedConnectionTarget) => void;
}

export const useHostedConnectionStore = create<HostedConnectionState>((set) => ({
  enabled: false,
  bootstrapState: 'idle',
  localProbeState: 'idle',
  localApiConfig: null,
  localStatus: null,
  localError: null,
  remoteError: null,
  connectedTarget: null,

  initialize: enabled =>
    set({
      enabled,
      bootstrapState: enabled ? 'checking' : 'idle',
      localProbeState: enabled ? 'checking' : 'idle',
      localApiConfig: null,
      localStatus: null,
      localError: null,
      remoteError: null,
      connectedTarget: null,
    }),

  startChecking: () =>
    set({
      bootstrapState: 'checking',
      localProbeState: 'checking',
      localError: null,
      remoteError: null,
      connectedTarget: null,
    }),

  setLocalAvailable: (localApiConfig, localStatus) =>
    set({
      localProbeState: 'available',
      localApiConfig,
      localStatus,
      localError: null,
    }),

  setLocalUnavailable: localError =>
    set({
      localProbeState: 'unavailable',
      localApiConfig: null,
      localStatus: null,
      localError,
    }),

  setRemoteError: remoteError => set({ remoteError }),

  setOnboarding: () =>
    set({
      bootstrapState: 'onboarding',
      connectedTarget: null,
    }),

  setConnected: connectedTarget =>
    set({
      bootstrapState: 'connected',
      connectedTarget,
      remoteError: null,
    }),
}));
