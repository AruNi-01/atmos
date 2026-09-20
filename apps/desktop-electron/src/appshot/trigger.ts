/**
 * macOS Appshots global trigger: Left + Right Shift chord only.
 *
 * Native dylib (dedicated CFRunLoop thread) + poll take_chord — Tauri parity.
 * No poll-only path, no double-tap fallback.
 */

import type { AppState } from "../app-state.js";
import { mainLog } from "../main-log.js";
import type { HostShiftCapturedPayload } from "./host-shift.js";
import {
  startShiftFlagsEventTap,
  type TapHandle,
} from "./trigger-event-tap.js";

export type TriggerListenerStatus = {
  enabled: boolean;
  starting: boolean;
  lastError: string | null;
  mode: "event-tap" | "none";
};

let status: TriggerListenerStatus = {
  enabled: false,
  starting: false,
  lastError: null,
  mode: "none",
};
let captureRunning = false;
let onTrigger: (() => void | Promise<void>) | null = null;
let onHostCaptured: ((payload: HostShiftCapturedPayload) => void | Promise<void>) | null =
  null;
let onNeedGrant: ((missing: string[]) => void | Promise<void>) | null = null;
let onHostReady: ((info: { ax: boolean; tap: boolean }) => void | Promise<void>) | null =
  null;
let tapHandle: TapHandle | null = null;
/** Accessibility trust observed at last successful arm. */
let armedWithAx = false;

function fireCapture(): void {
  if (captureRunning) return;
  captureRunning = true;
  const run = onTrigger;
  void Promise.resolve()
    .then(() => run?.())
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      mainLog(`[appshot-trigger] capture failed: ${msg}`, "error");
      status.lastError = msg;
    })
    .finally(() => {
      captureRunning = false;
    });
}

function fireHostCaptured(payload: HostShiftCapturedPayload): void {
  if (captureRunning) return;
  captureRunning = true;
  const run = onHostCaptured;
  void Promise.resolve()
    .then(() => run?.(payload))
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      mainLog(`[appshot-trigger] host capture failed: ${msg}`, "error");
      status.lastError = msg;
    })
    .finally(() => {
      captureRunning = false;
    });
}

function fireNeedGrant(missing: string[]): void {
  const run = onNeedGrant;
  void Promise.resolve()
    .then(() => run?.(missing))
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      mainLog(`[appshot-trigger] need-grant failed: ${msg}`, "warn");
    });
}

export function triggerListenerStatus(): TriggerListenerStatus {
  return { ...status };
}

function disarm(): void {
  if (tapHandle) {
    try {
      tapHandle.stop();
    } catch {
      /* ignore */
    }
    tapHandle = null;
  }
  captureRunning = false;
  armedWithAx = false;
}

export async function ensureTriggerListener(
  state: AppState,
  triggerCapture: (state: AppState) => Promise<void>,
  accessibilityGranted?: boolean,
  hooks?: {
    hostCaptured?: (
      state: AppState,
      payload: HostShiftCapturedPayload,
    ) => Promise<void>;
    needGrant?: (missing: string[]) => Promise<void>;
    hostReady?: (info: { ax: boolean; tap: boolean }) => Promise<void>;
  },
): Promise<TriggerListenerStatus> {
  if (process.platform !== "darwin") {
    status = {
      enabled: false,
      starting: false,
      lastError: "Appshots gesture trigger is only available on macOS",
      mode: "none",
    };
    return triggerListenerStatus();
  }

  onTrigger = () => triggerCapture(state);
  onHostCaptured = hooks?.hostCaptured
    ? (payload) => hooks.hostCaptured?.(state, payload)
    : null;
  onNeedGrant = hooks?.needGrant ?? null;
  onHostReady = hooks?.hostReady ?? null;

  const ax = Boolean(accessibilityGranted);

  // Re-arm when Accessibility flips true after a cold start without trust.
  if (tapHandle && status.enabled && ax && !armedWithAx) {
    disarm();
    status = {
      enabled: false,
      starting: false,
      lastError: null,
      mode: "none",
    };
  }

  if (status.enabled || status.starting || tapHandle) {
    return triggerListenerStatus();
  }

  status = { ...status, starting: true, lastError: null };

  try {
    const handle = startShiftFlagsEventTap({
      onElectronChord: () => fireCapture(),
      onHostCaptured: (payload) => fireHostCaptured(payload),
      onNeedGrant: (missing) => fireNeedGrant(missing),
      onIgnored: (reason) => {
        mainLog(`[appshot-trigger] host ignored: ${reason}`);
      },
      onHostReady: (info) => {
        void Promise.resolve()
          .then(() => onHostReady?.(info))
          .catch((error) => {
            const msg = error instanceof Error ? error.message : String(error);
            mainLog(`[appshot-trigger] host-ready failed: ${msg}`, "warn");
          });
      },
    });
    if (!handle) {
      status = {
        enabled: false,
        starting: false,
        lastError:
          "failed to create dual-shift event tap — grant Accessibility, then refresh Appshots",
        mode: "none",
      };
      mainLog(`[appshot-trigger] arm FAILED: ${status.lastError}`, "error");
      return triggerListenerStatus();
    }
    tapHandle = handle;
    armedWithAx = ax;
    status = {
      enabled: true,
      starting: false,
      lastError: ax
        ? null
        : "Accessibility is off — dual-shift will not receive keys until the host is trusted (System Settings → Privacy → Accessibility)",
      mode: "event-tap",
    };
  } catch (error) {
    status = {
      enabled: false,
      starting: false,
      lastError: error instanceof Error ? error.message : String(error),
      mode: "none",
    };
    mainLog(`[appshot-trigger] arm FAILED: ${status.lastError}`, "error");
  }

  return triggerListenerStatus();
}

export function stopTriggerListener(): void {
  disarm();
  onTrigger = null;
  onHostCaptured = null;
  onNeedGrant = null;
  onHostReady = null;
  status = {
    enabled: false,
    starting: false,
    lastError: status.lastError,
    mode: "none",
  };
}

export function resetTriggerListenerForTest(): void {
  stopTriggerListener();
  status = {
    enabled: false,
    starting: false,
    lastError: null,
    mode: "none",
  };
}
