"use client";

import { create } from "zustand";

import { desktopListen, isElectronShell } from "@/shared/lib/desktop-bridge";

export type Phase =
  | "idle"
  | "probing"
  | "setup_required"
  | "starting"
  | "streaming"
  | "reconnecting"
  | "failed";

export type SessionView = {
  phase: Phase;
  workspaceId: string;
  simulator: { id: string; name: string; runtime: string } | null;
  streamBaseUrl: string | null;
  transport: "http" | "webrtc" | null;
  codec: "h264" | "mjpeg" | null;
  size: { width: number; height: number } | null;
  lastError: { code: string; message: string } | null;
  streamRev?: number | null;
};

export type ProbeResult = {
  ok: boolean;
  code: string | null;
  facts: {
    macosVersion?: string;
    arch?: string;
    xcodePath?: string;
    xcodeVersion?: string;
    helperVersion?: string;
    runtimes: Array<{
      identifier: string;
      name: string;
      version: string;
      isAvailable: boolean;
      platform: string;
    }>;
    simulators: Array<{
      id: string;
      name: string;
      runtimeId: string;
      runtimeName: string;
      state: string;
      isAvailable: boolean;
      typeId: string;
    }>;
  };
};

export type SimulatorLog = {
  step: string;
  message: string;
};

export type SimulatorSlice = {
  session: SessionView;
  probe: ProbeResult | null;
  logs: SimulatorLog[];
  visibleSurfaces: { sidebar: boolean; center: boolean };
  attachInFlight: boolean;
};

export type Slice = SimulatorSlice;

type SimulatorSessionStore = {
  byWorkspace: Record<string, SimulatorSlice>;
  applyProbe: (workspaceId: string, probe: ProbeResult) => void;
  applyStatus: (workspaceId: string, session: SessionView) => void;
  applyLog: (workspaceId: string, log: SimulatorLog) => void;
  setSurfaceVisible: (
    workspaceId: string,
    surface: "sidebar" | "center",
    visible: boolean,
  ) => void;
  beginAttachIfIdle: (workspaceId: string) => boolean;
  markAttachInFlight: (workspaceId: string, value: boolean) => void;
  getSlice: (workspaceId: string) => SimulatorSlice;
  visibleSurfaceCount: (workspaceId: string) => number;
};

const defaultSlices = new Map<string, SimulatorSlice>();

function createInitialSlice(workspaceId: string): SimulatorSlice {
  return {
    session: {
      phase: "idle",
      workspaceId,
      simulator: null,
      streamBaseUrl: null,
      transport: null,
      codec: null,
      size: null,
      lastError: null,
      streamRev: null,
    },
    probe: null,
    logs: [],
    visibleSurfaces: { sidebar: false, center: false },
    attachInFlight: false,
  };
}

function getDefaultSlice(workspaceId: string): SimulatorSlice {
  const cached = defaultSlices.get(workspaceId);
  if (cached) return cached;
  const created = createInitialSlice(workspaceId);
  defaultSlices.set(workspaceId, created);
  return created;
}

function isPhase(value: unknown): value is Phase {
  return (
    value === "idle" ||
    value === "probing" ||
    value === "setup_required" ||
    value === "starting" ||
    value === "streaming" ||
    value === "reconnecting" ||
    value === "failed"
  );
}

function asProbeResult(value: unknown): ProbeResult | null {
  if (!value || typeof value !== "object") return null;
  const probe = value as Partial<ProbeResult>;
  if (
    typeof probe.ok !== "boolean" ||
    (probe.code !== null && typeof probe.code !== "string") ||
    !probe.facts ||
    typeof probe.facts !== "object" ||
    !Array.isArray(probe.facts.runtimes) ||
    !Array.isArray(probe.facts.simulators)
  ) {
    return null;
  }
  return probe as ProbeResult;
}

function asSessionView(value: unknown): SessionView | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<SessionView>;
  return typeof session.workspaceId === "string" && isPhase(session.phase)
    ? (session as SessionView)
    : null;
}

function eventWorkspaceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const workspaceId = (value as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}

export const useSimulatorSessionStore = create<SimulatorSessionStore>()((set, get) => ({
  byWorkspace: {},

  applyProbe: (workspaceId, probe) =>
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: { ...current, probe },
        },
      };
    }),

  applyStatus: (workspaceId, session) =>
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: { ...current, session },
        },
      };
    }),

  applyLog: (workspaceId, log) =>
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: {
            ...current,
            logs: [...current.logs, log].slice(-30),
          },
        },
      };
    }),

  setSurfaceVisible: (workspaceId, surface, visible) =>
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: {
            ...current,
            visibleSurfaces: { ...current.visibleSurfaces, [surface]: visible },
          },
        },
      };
    }),

  beginAttachIfIdle: (workspaceId) => {
    let began = false;
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      if (
        current.attachInFlight ||
        (current.session.phase !== "idle" &&
          current.session.phase !== "setup_required" &&
          current.session.phase !== "failed")
      ) {
        return state;
      }
      began = true;
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: { ...current, attachInFlight: true },
        },
      };
    });
    return began;
  },

  markAttachInFlight: (workspaceId, value) =>
    set((state) => {
      const current = state.byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId);
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: { ...current, attachInFlight: value },
        },
      };
    }),

  getSlice: (workspaceId) => get().byWorkspace[workspaceId] ?? getDefaultSlice(workspaceId),

  visibleSurfaceCount: (workspaceId) => {
    const surfaces = get().getSlice(workspaceId).visibleSurfaces;
    return Number(surfaces.sidebar) + Number(surfaces.center);
  },
}));

let eventBridgePromise: Promise<void> | null = null;

export function ensureSimulatorEventBridge(): Promise<void> {
  if (!isElectronShell()) return Promise.resolve();
  if (eventBridgePromise) return eventBridgePromise;

  eventBridgePromise = Promise.all([
    desktopListen("simulator://probe", (payload) => {
      const probe = asProbeResult(payload);
      if (!probe) return;
      const workspaceId = eventWorkspaceId(payload);
      if (workspaceId) {
        useSimulatorSessionStore.getState().applyProbe(workspaceId, probe);
        return;
      }
      for (const id of Object.keys(useSimulatorSessionStore.getState().byWorkspace)) {
        useSimulatorSessionStore.getState().applyProbe(id, probe);
      }
    }),
    desktopListen("simulator://status", (payload) => {
      const session = asSessionView(payload);
      if (!session) return;
      useSimulatorSessionStore.getState().applyStatus(session.workspaceId, session);
    }),
    desktopListen("simulator://log", (payload) => {
      if (!payload || typeof payload !== "object") return;
      const workspaceId = eventWorkspaceId(payload);
      const step = (payload as { step?: unknown }).step;
      const message = (payload as { message?: unknown }).message;
      if (!workspaceId || typeof step !== "string" || typeof message !== "string") return;
      useSimulatorSessionStore.getState().applyLog(workspaceId, { step, message });
    }),
  ])
    .then(() => undefined)
    .catch(() => {
      eventBridgePromise = null;
    });

  return eventBridgePromise;
}

export function useSimulatorSession(workspaceId: string): SimulatorSlice {
  return useSimulatorSessionStore((state) => state.getSlice(workspaceId));
}

export type { SimulatorSessionStore };
