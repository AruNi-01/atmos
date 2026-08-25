"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LiveResourceSessionLocation } from "@/features/terminal/public/pane-location";

export const TERMINAL_PANE_LOCATE_DURATION_MS = 2400;

export type TerminalPaneLocatePhase = "idle" | "pending" | "active";

export type TerminalPaneLocateSnapshot = {
  generation: number;
  phase: TerminalPaneLocatePhase;
  target: LiveResourceSessionLocation | null;
};

export type TerminalPaneLocateTimerApi = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

export type TerminalPaneLocateController = TerminalPaneLocateSnapshot & {
  request: (target: LiveResourceSessionLocation) => number;
  arrive: (generation: number) => void;
  clear: () => void;
  getState: () => TerminalPaneLocateSnapshot;
  subscribe: (listener: (snapshot: TerminalPaneLocateSnapshot) => void) => () => void;
};

export type TerminalPaneLocateStoreState = TerminalPaneLocateSnapshot & {
  request: (target: LiveResourceSessionLocation) => number;
  arrive: (generation: number) => void;
  clear: () => void;
};

const defaultTimers: TerminalPaneLocateTimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => {
    globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>);
  },
};

function snapshotOf(
  generation: number,
  phase: TerminalPaneLocatePhase,
  target: LiveResourceSessionLocation | null,
): TerminalPaneLocateSnapshot {
  return { generation, phase, target };
}

/**
 * Generation-safe locate controller. Tests inject timers so they never sleep
 * real time. An older timer cannot clear a newer `request`.
 */
export function createTerminalPaneLocateController(options?: {
  timers?: TerminalPaneLocateTimerApi;
  durationMs?: number;
}): TerminalPaneLocateController {
  const timers = options?.timers ?? defaultTimers;
  const durationMs = options?.durationMs ?? TERMINAL_PANE_LOCATE_DURATION_MS;
  let generation = 0;
  let phase: TerminalPaneLocatePhase = "idle";
  let target: LiveResourceSessionLocation | null = null;
  let timerId: unknown = null;
  const listeners = new Set<(snapshot: TerminalPaneLocateSnapshot) => void>();

  const emit = () => {
    const snapshot = snapshotOf(generation, phase, target);
    for (const listener of listeners) listener(snapshot);
  };

  const clearTimer = () => {
    if (timerId == null) return;
    timers.clearTimeout(timerId);
    timerId = null;
  };

  const getState = () => snapshotOf(generation, phase, target);

  const request = (nextTarget: LiveResourceSessionLocation) => {
    clearTimer();
    generation += 1;
    phase = "pending";
    target = nextTarget;
    emit();
    return generation;
  };

  const arrive = (arrivedGeneration: number) => {
    if (arrivedGeneration !== generation || phase !== "pending") return;
    const ownedGeneration = generation;
    phase = "active";
    emit();
    clearTimer();
    timerId = timers.setTimeout(() => {
      if (generation !== ownedGeneration) return;
      timerId = null;
      phase = "idle";
      target = null;
      emit();
    }, durationMs);
  };

  const clear = () => {
    clearTimer();
    if (phase === "idle" && target == null) return;
    phase = "idle";
    target = null;
    emit();
  };

  return {
    get generation() {
      return generation;
    },
    get phase() {
      return phase;
    },
    get target() {
      return target;
    },
    request,
    arrive,
    clear,
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createTerminalPaneLocateStore(options?: {
  timers?: TerminalPaneLocateTimerApi;
  durationMs?: number;
}): UseBoundStore<StoreApi<TerminalPaneLocateStoreState>> {
  const controller = createTerminalPaneLocateController(options);
  return create<TerminalPaneLocateStoreState>((set) => {
    controller.subscribe((snapshot) => {
      set({
        generation: snapshot.generation,
        phase: snapshot.phase,
        target: snapshot.target,
      });
    });
    return {
      ...controller.getState(),
      request: (target) => controller.request(target),
      arrive: (generation) => controller.arrive(generation),
      clear: () => controller.clear(),
    };
  });
}

export const useTerminalPaneLocateStore = createTerminalPaneLocateStore();
