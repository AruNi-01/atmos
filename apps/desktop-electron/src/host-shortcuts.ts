/**
 * While Atmos is the active app, claim OS-reserved chords (macOS screenshots
 * ⌘⇧3/4/5/6) so product shortcuts win, then replay the key into the focused
 * window for the existing renderer hotkeys.
 *
 * Primary: in-process CGEventTap (needs Accessibility, same as AppShot).
 * Fallback: Electron globalShortcut if the tap cannot start.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow, WebContents } from "electron";
import { mainLog } from "./main-log.js";
import {
  chordForDigit,
  keyboardInputEventsForChord,
  osReservedShortcutChords,
  type OsReservedShortcutChord,
} from "./os-reserved-shortcuts.js";

const nodeRequire = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

type ElectronApi = typeof import("electron");

type HostShortcutNative = {
  stop: () => void;
  setEnabled: (enabled: number) => void;
  takeDigit: () => number;
};

let installed = false;
let native: HostShortcutNative | null = null;
let nativePoll: ReturnType<typeof setInterval> | null = null;
let globalClaimed = false;
let enabled = false;

function getElectronApi(): ElectronApi | null {
  if (typeof process.versions.electron !== "string") return null;
  try {
    const mod = nodeRequire("electron") as ElectronApi | string;
    if (typeof mod === "string" || !mod?.app) return null;
    return mod;
  } catch {
    return null;
  }
}

function nativeDylibPath(): string | null {
  const name = "libatmos_host_shortcuts.dylib";
  const candidates: string[] = [];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, "bin", name));
    candidates.push(
      join(process.resourcesPath, "app.asar.unpacked", "resources", "bin", name),
    );
  }
  candidates.push(join(__dirname, "../resources/bin", name));
  candidates.push(join(process.cwd(), "apps/desktop-electron/resources/bin", name));
  candidates.push(join(process.cwd(), "resources/bin", name));
  return candidates.find((path) => existsSync(path)) ?? null;
}

function loadNative(): HostShortcutNative | null {
  if (process.platform !== "darwin") return null;
  const dylib = nativeDylibPath();
  if (!dylib) {
    mainLog("[host-shortcuts] native dylib missing", "warn");
    return null;
  }
  try {
    const koffi = nodeRequire("koffi") as {
      load: (path: string) => {
        func: (
          name: string,
          result: string,
          args: string[],
        ) => (...fnArgs: never[]) => unknown;
      };
    };
    const lib = koffi.load(dylib);
    const start = lib.func("atmos_host_shortcuts_start", "int", []) as () => number;
    const stop = lib.func("atmos_host_shortcuts_stop", "void", []) as () => void;
    const setEnabled = lib.func("atmos_host_shortcuts_set_enabled", "void", [
      "int",
    ]) as (enabled: number) => void;
    const takeDigit = lib.func("atmos_host_shortcuts_take_digit", "int", []) as () => number;
    const status = lib.func("atmos_host_shortcuts_status", "int", []) as () => number;
    const rc = start();
    if (status() !== 2) {
      mainLog(
        `[host-shortcuts] native start failed rc=${rc} status=${status()}`,
        "warn",
      );
      try {
        stop();
      } catch {
        /* ignore */
      }
      return null;
    }
    mainLog(`[host-shortcuts] native tap ready dylib=${dylib}`);
    return { stop, setEnabled, takeDigit };
  } catch (error) {
    mainLog(
      `[host-shortcuts] native load failed: ${error instanceof Error ? error.message : String(error)}`,
      "warn",
    );
    return null;
  }
}

export function replayChordIntoWindow(
  win: BrowserWindow,
  chord: OsReservedShortcutChord,
): void {
  if (win.isDestroyed()) return;
  const contents: WebContents = win.webContents;
  if (contents.isDestroyed()) return;
  for (const event of keyboardInputEventsForChord(chord)) {
    try {
      contents.sendInputEvent(event);
    } catch (error) {
      mainLog(
        `[host-shortcuts] replay ${chord.accelerator} failed: ${error instanceof Error ? error.message : String(error)}`,
        "warn",
      );
    }
  }
}

function replayDigit(api: ElectronApi, digit: number): void {
  const chord = chordForDigit(digit);
  if (!chord) return;
  const win = api.BrowserWindow.getFocusedWindow();
  if (!win || win.isDestroyed()) return;
  replayChordIntoWindow(win, chord);
}

function registerGlobalFallback(api: ElectronApi): void {
  if (globalClaimed) return;
  let any = false;
  for (const chord of osReservedShortcutChords()) {
    try {
      const ok = api.globalShortcut.register(chord.accelerator, () => {
        replayDigit(api, chord.digit);
      });
      if (ok) any = true;
      else {
        mainLog(
          `[host-shortcuts] globalShortcut refused ${chord.accelerator}`,
          "warn",
        );
      }
    } catch (error) {
      mainLog(
        `[host-shortcuts] globalShortcut ${chord.accelerator}: ${error instanceof Error ? error.message : String(error)}`,
        "warn",
      );
    }
  }
  globalClaimed = any;
}

function unregisterGlobalFallback(api: ElectronApi): void {
  if (!globalClaimed) return;
  for (const chord of osReservedShortcutChords()) {
    try {
      api.globalShortcut.unregister(chord.accelerator);
    } catch {
      /* ignore */
    }
  }
  globalClaimed = false;
}

function setClaimEnabled(api: ElectronApi, next: boolean): void {
  native?.setEnabled(next ? 1 : 0);
  if (enabled === next) return;
  enabled = next;
  if (next) {
    if (!native) registerGlobalFallback(api);
  } else {
    unregisterGlobalFallback(api);
  }
}

function drainNative(api: ElectronApi): void {
  if (!native) return;
  for (let i = 0; i < 8; i += 1) {
    const digit = native.takeDigit();
    if (!digit) break;
    replayDigit(api, digit);
  }
}

function atmosIsActive(api: ElectronApi): boolean {
  if (api.BrowserWindow.getFocusedWindow()) return true;
  return api.BrowserWindow.getAllWindows().some(
    (win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized(),
  );
}

/**
 * Register focus/active listeners. Safe to call more than once; no-ops outside
 * Electron or on hosts where nothing is OS-reserved.
 */
export function installAppShortcutGuard(): void {
  if (installed) return;
  installed = true;
  if (osReservedShortcutChords().length === 0) return;

  const api = getElectronApi();
  if (!api) return;

  native = loadNative();
  if (native) {
    nativePoll = setInterval(() => drainNative(api), 20);
    nativePoll.unref?.();
  }

  const sync = () => setClaimEnabled(api, atmosIsActive(api));

  api.app.on("browser-window-focus", () => setClaimEnabled(api, true));
  api.app.on("browser-window-blur", () => {
    setImmediate(() => {
      if (!api.BrowserWindow.getFocusedWindow()) setClaimEnabled(api, false);
    });
  });
  if (process.platform === "darwin") {
    api.app.on("did-become-active", () => setClaimEnabled(api, true));
    api.app.on("did-resign-active", () => setClaimEnabled(api, false));
  }
  api.app.on("will-quit", () => {
    setClaimEnabled(api, false);
    if (nativePoll) {
      clearInterval(nativePoll);
      nativePoll = null;
    }
    try {
      native?.stop();
    } catch {
      /* ignore */
    }
    native = null;
  });

  sync();
}
