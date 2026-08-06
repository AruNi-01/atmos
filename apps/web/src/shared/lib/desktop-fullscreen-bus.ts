/**
 * Single-subscriber bus for `window-fullscreen-changed`.
 *
 * Many UI surfaces need traffic-light padding; each used to call desktopListen
 * and hit MaxListenersExceededWarning (default 10). One IPC subscription fans
 * out to all React hooks instead.
 */

import { desktopInvoke, desktopListen, isDesktopRuntime, isTauriShell } from "./desktop-bridge";

type Listener = (fullscreen: boolean) => void;

const listeners = new Set<Listener>();
let ipcUnlisten: (() => void) | null = null;
let subscribePromise: Promise<void> | null = null;
let currentFullscreen = false;
let known = false;

function emit(fullscreen: boolean) {
  known = true;
  currentFullscreen = fullscreen;
  for (const listener of listeners) {
    try {
      listener(fullscreen);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

async function ensureIpcSubscription(): Promise<void> {
  if (!isDesktopRuntime() || isTauriShell()) return;
  if (ipcUnlisten || subscribePromise) {
    await subscribePromise;
    return;
  }

  subscribePromise = (async () => {
    try {
      const fs = await desktopInvoke<boolean>("window_is_fullscreen");
      emit(Boolean(fs));
    } catch {
      emit(!!document.fullscreenElement);
    }

    const off = await desktopListen("window-fullscreen-changed", (payload) => {
      const fs = Boolean(
        payload &&
          typeof payload === "object" &&
          "fullscreen" in payload &&
          (payload as { fullscreen?: unknown }).fullscreen,
      );
      emit(fs);
    });
    ipcUnlisten = typeof off === "function" ? off : null;
  })();

  try {
    await subscribePromise;
  } finally {
    subscribePromise = null;
  }
}

function maybeTeardownIpc() {
  if (listeners.size > 0) return;
  ipcUnlisten?.();
  ipcUnlisten = null;
  known = false;
}

/**
 * Subscribe to desktop window fullscreen state. Returns unsubscribe.
 * Immediately invokes listener when state is already known.
 */
export function subscribeDesktopFullscreen(listener: Listener): () => void {
  listeners.add(listener);
  if (known) {
    try {
      listener(currentFullscreen);
    } catch {
      /* ignore */
    }
  }
  void ensureIpcSubscription();

  return () => {
    listeners.delete(listener);
    maybeTeardownIpc();
  };
}

export function __resetDesktopFullscreenBusForTests(): void {
  listeners.clear();
  ipcUnlisten?.();
  ipcUnlisten = null;
  subscribePromise = null;
  known = false;
  currentFullscreen = false;
}
