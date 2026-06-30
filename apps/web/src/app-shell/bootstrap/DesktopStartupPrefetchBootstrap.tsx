'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { useProjectStore } from '@/features/project/store/use-project-store';

const PROJECT_PREFETCH_IDLE_TIMEOUT_MS = 12_000;
const DESKTOP_STARTUP_PREFETCH_TIMEOUT_MS = 30_000;

type DesktopStartupPrefetchStatus = 'idle' | 'loading' | 'settled';

let desktopStartupPrefetchPromise: Promise<void> | null = null;
let desktopStartupPrefetchStatus: DesktopStartupPrefetchStatus = 'idle';
const desktopStartupPrefetchListeners = new Set<() => void>();

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function setDesktopStartupPrefetchStatus(
  nextStatus: DesktopStartupPrefetchStatus,
) {
  if (desktopStartupPrefetchStatus === nextStatus) {
    return;
  }

  desktopStartupPrefetchStatus = nextStatus;
  desktopStartupPrefetchListeners.forEach((listener) => listener());
}

function subscribeDesktopStartupPrefetch(listener: () => void) {
  desktopStartupPrefetchListeners.add(listener);
  return () => {
    desktopStartupPrefetchListeners.delete(listener);
  };
}

function getDesktopStartupPrefetchSnapshot() {
  return desktopStartupPrefetchStatus;
}

function getDesktopStartupPrefetchServerSnapshot() {
  return 'settled' as const;
}

function waitForProjectIdle(timeoutMs = PROJECT_PREFETCH_IDLE_TIMEOUT_MS): Promise<void> {
  if (!useProjectStore.getState().isLoading) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (unsubscribe) {
        unsubscribe();
      }
      window.clearTimeout(timeout);
      resolve();
    };

    const timeout = window.setTimeout(finish, timeoutMs);
    unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.isLoading) {
        finish();
      }
    });
  });
}

function waitForWebSocketConnected(): Promise<void> {
  if (useWebSocketStore.getState().connectionState === 'connected') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (unsubscribe) {
        unsubscribe();
      }
      resolve();
    };

    unsubscribe = useWebSocketStore.subscribe((state) => {
      if (state.connectionState === 'connected') {
        finish();
      }
    });

    if (useWebSocketStore.getState().connectionState === 'connected') {
      finish();
      return;
    }

    void useWebSocketStore
      .getState()
      .connect()
      .catch(() => {
        // connect() schedules reconnect internally; keep waiting for the store
        // to report a real connected state or for the startup timeout to fire.
      });
  });
}

export function runDesktopStartupPrefetch(): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  if (!desktopStartupPrefetchPromise) {
    desktopStartupPrefetchPromise = (async () => {
      await waitForWebSocketConnected();

      const { projects, isLoading, fetchProjects } = useProjectStore.getState();
      if (projects.length > 0) {
        return;
      }

      if (isLoading) {
        await waitForProjectIdle();
        return;
      }

      await fetchProjects();
      await waitForProjectIdle();
    })().catch((err) => {
      desktopStartupPrefetchPromise = null;
      throw err;
    });
  }

  return desktopStartupPrefetchPromise;
}

export function waitForDesktopStartupPrefetch(
  timeoutMs = DESKTOP_STARTUP_PREFETCH_TIMEOUT_MS,
): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  const prefetch = runDesktopStartupPrefetch().catch((err) => {
    console.warn('[DesktopStartupPrefetch] prefetch failed:', err);
  });

  return Promise.race([
    prefetch,
    delay(timeoutMs).then(() => {
      console.warn('[DesktopStartupPrefetch] prefetch timed out');
    }),
  ]);
}

function startDesktopStartupPrefetchLoading() {
  if (!isTauriRuntime()) {
    setDesktopStartupPrefetchStatus('settled');
    return;
  }

  if (desktopStartupPrefetchStatus !== 'idle') {
    return;
  }

  setDesktopStartupPrefetchStatus('loading');
  void waitForDesktopStartupPrefetch().finally(() => {
    setDesktopStartupPrefetchStatus('settled');
  });
}

export function useDesktopStartupPrefetchLoading(enabled = true): boolean {
  const status = useSyncExternalStore(
    subscribeDesktopStartupPrefetch,
    getDesktopStartupPrefetchSnapshot,
    getDesktopStartupPrefetchServerSnapshot,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    startDesktopStartupPrefetchLoading();
  }, [enabled]);

  return enabled && isTauriRuntime() && status !== 'settled';
}

/** Kick off desktop connection bootstrap + project fetch as early as the root layout mounts. */
export function DesktopStartupPrefetchBootstrap() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    startDesktopStartupPrefetchLoading();
  }, []);

  return null;
}
