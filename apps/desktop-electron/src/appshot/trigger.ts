/**
 * macOS Appshots global trigger: Left Shift + Right Shift chord.
 *
 * Tauri uses a CGEventTap (FlagsChanged). Electron polls
 * CGEventSourceKeyState via koffi so we avoid a native addon build,
 * while matching the same chord semantics and Accessibility gate.
 */

import { createRequire } from "node:module";
import type { AppState } from "../app-state.js";
import {
  createShiftChordState,
  observeShiftChordFromSamples,
} from "./shift-chord.js";

const POLL_MS = 30;
/** HID system state — see CGEventSourceStateID */
const HID_SYSTEM_STATE = 1;
/** Carbon virtual key codes */
const VK_SHIFT = 0x38;
const VK_RIGHT_SHIFT = 0x3c;

const require = createRequire(import.meta.url);

export type TriggerListenerStatus = {
  enabled: boolean;
  starting: boolean;
  lastError: string | null;
};

type KeyStateFn = (sourceStateId: number, keyCode: number) => boolean;

let keyStateFn: KeyStateFn | null | undefined;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let status: TriggerListenerStatus = {
  enabled: false,
  starting: false,
  lastError: null,
};
let captureRunning = false;
let prevLeft = false;
let prevRight = false;
const chord = createShiftChordState();
let onTrigger: (() => void | Promise<void>) | null = null;

function loadKeyStateFn(): KeyStateFn | null {
  if (keyStateFn !== undefined) return keyStateFn;
  if (process.platform !== "darwin") {
    keyStateFn = null;
    return null;
  }
  try {
    // koffi is a native module — load at runtime (esbuild external).
    const koffi = require("koffi") as typeof import("koffi");
    const cg = koffi.load(
      "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
    );
    const CGEventSourceKeyState = cg.func(
      "CGEventSourceKeyState",
      "bool",
      ["int", "uint16"],
    );
    keyStateFn = (sourceStateId, keyCode) =>
      Boolean(CGEventSourceKeyState(sourceStateId, keyCode));
    return keyStateFn;
  } catch (error) {
    status.lastError = `failed to load CoreGraphics key-state probe: ${
      error instanceof Error ? error.message : String(error)
    }`;
    keyStateFn = null;
    return null;
  }
}

export function triggerListenerStatus(): TriggerListenerStatus {
  return { ...status };
}

/**
 * Start (or no-op) the dual-shift listener when Accessibility is granted.
 * Safe to call repeatedly (e.g. on each appshot_status refresh).
 */
export async function ensureTriggerListener(
  state: AppState,
  triggerCapture: (state: AppState) => Promise<void>,
  accessibilityGranted: boolean,
): Promise<TriggerListenerStatus> {
  if (process.platform !== "darwin") {
    status = {
      enabled: false,
      starting: false,
      lastError: "Appshots gesture trigger is only available on macOS",
    };
    return triggerListenerStatus();
  }

  if (!accessibilityGranted) {
    stopTriggerListener();
    status = {
      enabled: false,
      starting: false,
      lastError: null,
    };
    return triggerListenerStatus();
  }

  // Refresh capture callback even if already running (state may be rebuilt).
  onTrigger = () => triggerCapture(state);

  if (status.enabled || status.starting) {
    return triggerListenerStatus();
  }

  status = { ...status, starting: true, lastError: null };

  const probe = loadKeyStateFn();
  if (!probe) {
    status = {
      enabled: false,
      starting: false,
      lastError:
        status.lastError ??
        "failed to create Appshots trigger listener; verify Accessibility permission for Atmos Electron.",
    };
    return triggerListenerStatus();
  }

  prevLeft = false;
  prevRight = false;
  chord.shiftActive = false;
  chord.lastSide = null;
  chord.chordDown = false;
  captureRunning = false;

  pollTimer = setInterval(() => {
    try {
      tick(probe);
    } catch (error) {
      status.lastError = `Appshots trigger poll failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, POLL_MS);
  // Do not keep the process alive solely for the poller.
  pollTimer.unref?.();

  status = { enabled: true, starting: false, lastError: null };
  console.log(
    "[desktop-electron] Appshots dual-shift trigger listener enabled",
  );
  return triggerListenerStatus();
}

export function stopTriggerListener(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  onTrigger = null;
  captureRunning = false;
  status = {
    enabled: false,
    starting: false,
    lastError: status.lastError,
  };
}

function tick(probe: KeyStateFn): void {
  const leftDown = probe(HID_SYSTEM_STATE, VK_SHIFT);
  const rightDown = probe(HID_SYSTEM_STATE, VK_RIGHT_SHIFT);
  const shouldCapture = observeShiftChordFromSamples(
    chord,
    leftDown,
    rightDown,
    prevLeft,
    prevRight,
  );
  prevLeft = leftDown;
  prevRight = rightDown;

  if (!shouldCapture || captureRunning) return;
  captureRunning = true;
  const run = onTrigger;
  void Promise.resolve()
    .then(() => run?.())
    .catch((error) => {
      console.error("[desktop-electron] Appshots capture failed:", error);
      status.lastError =
        error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      captureRunning = false;
    });
}

/** Test helper: reset module-level listener state. */
export function resetTriggerListenerForTest(): void {
  stopTriggerListener();
  keyStateFn = undefined;
  status = { enabled: false, starting: false, lastError: null };
  prevLeft = false;
  prevRight = false;
  chord.shiftActive = false;
  chord.lastSide = null;
  chord.chordDown = false;
}
