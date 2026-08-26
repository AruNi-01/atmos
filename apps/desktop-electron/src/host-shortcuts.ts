/**
 * While Atmos is frontmost, swallow macOS screenshot chords (⌘⇧3/4/5/6) for
 * that key event only so product shortcuts win. Do not disable system
 * screenshot hotkeys globally — a crash would leak that disable.
 *
 * Desktop Use is not required. A consuming CGEventTap needs Accessibility on
 * the process that installs it:
 *   - Atmos (Electron) tap when this app is trusted
 *   - Desktop Use inject tap when that host is already installed (same AX
 *     grant AppShot uses) — optional, not a download gate
 * Guest webviews: before-input-event forwards ⌘/⌘⇧ digits into the host page.
 *
 * Do not synthesize the key with sendInputEvent — that can re-trigger
 * Screenshot.app. Electron globalShortcut cannot preempt Screenshot.app.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WebContents } from "electron";
import { mainLog } from "./main-log.js";
import {
  chordForDigit,
  HOST_DIGIT_SHORTCUT_EVENT,
  osReservedShortcutChords,
  parseElectronInputDigitShortcut,
  type HostDigitShortcutPayload,
} from "./os-reserved-shortcuts.js";

const nodeRequire = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

type ElectronApi = typeof import("electron");

type HostShortcutNative = {
  stop: () => void;
  setEnabled: (enabled: number) => void;
  takeDigit: () => number;
  tapReady: () => number;
};

let installed = false;
let native: HostShortcutNative | null = null;
let nativePoll: ReturnType<typeof setInterval> | null = null;
let enabled = false;
let tornDown = false;
let injectListenStop: (() => void) | null = null;
let electronAxPrompted = false;

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
    const axTrusted = lib.func("atmos_host_shortcuts_ax_trusted", "int", []) as () => number;
    const tapReady = lib.func("atmos_host_shortcuts_tap_ready", "int", []) as () => number;
    const rc = start();
    const ax = axTrusted();
    const tap = tapReady();
    if (status() !== 2 && !tap) {
      mainLog(
        `[host-shortcuts] electron tap unavailable rc=${rc} status=${status()} ax=${ax}`,
        "warn",
      );
      try {
        stop();
      } catch {
        /* ignore */
      }
      return null;
    }
    mainLog(`[host-shortcuts] electron tap ready dylib=${dylib} ax=${ax}`);
    return { stop, setEnabled, takeDigit, tapReady };
  } catch (error) {
    mainLog(
      `[host-shortcuts] native load failed: ${error instanceof Error ? error.message : String(error)}`,
      "warn",
    );
    return null;
  }
}

function hostWebContentsOf(contents: WebContents): WebContents {
  try {
    return contents.hostWebContents ?? contents;
  } catch {
    return contents;
  }
}

export function emitHostDigitShortcut(
  contents: WebContents,
  payload: HostDigitShortcutPayload,
): void {
  if (contents.isDestroyed()) return;
  const host = hostWebContentsOf(contents);
  if (host.isDestroyed()) return;
  host.send(`atmos:desktop-event:${HOST_DIGIT_SHORTCUT_EVENT}`, payload);
}

function emitDigitToFocusedWindow(api: ElectronApi, digit: number): void {
  const chord = chordForDigit(digit);
  if (!chord) return;
  const win =
    api.BrowserWindow.getFocusedWindow() ??
    api.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
  if (!win || win.isDestroyed()) return;
  emitHostDigitShortcut(win.webContents, { digit, shift: true });
}

function installGuestDigitShortcutForward(contents: WebContents): void {
  contents.on("before-input-event", (event, input) => {
    const parsed = parseElectronInputDigitShortcut(input);
    if (!parsed) return;
    event.preventDefault();
    emitHostDigitShortcut(contents, parsed);
  });
}

function tapIsReady(): boolean {
  try {
    return native?.tapReady() === 1;
  } catch {
    return false;
  }
}

function setClaimEnabled(api: ElectronApi, next: boolean): void {
  native?.setEnabled(next ? 1 : 0);
  if (enabled === next) return;
  enabled = next;
}

function drainNative(api: ElectronApi): void {
  if (!native) return;
  for (let i = 0; i < 8; i += 1) {
    const digit = native.takeDigit();
    if (!digit) break;
    emitDigitToFocusedWindow(api, digit);
  }
}

function atmosIsActive(api: ElectronApi): boolean {
  return Boolean(api.BrowserWindow.getFocusedWindow());
}

function ensureElectronTap(api: ElectronApi): void {
  if (tapIsReady() || tornDown) return;
  const next = loadNative();
  if (!next) return;
  native = next;
  native.setEnabled(enabled ? 1 : 0);
  if (!nativePoll) {
    nativePoll = setInterval(() => drainNative(api), 20);
    nativePoll.unref?.();
  }
}

async function desktopUseHostInstalled(): Promise<boolean> {
  try {
    const { desktopUseStatus } = await import("./desktop-use/client.js");
    const st = await desktopUseStatus();
    return st?.driver?.installed === true;
  } catch {
    return false;
  }
}

/**
 * No Desktop Use: the Electron process must be Accessibility-trusted so its
 * own tap can discard ⌘⇧3-6. Prompt once; retry when the user returns.
 */
async function ensureElectronTapWithoutDesktopUse(api: ElectronApi): Promise<void> {
  if (tornDown) return;
  ensureElectronTap(api);
  if (tapIsReady() || tornDown) return;
  if (electronAxPrompted) return;
  if (await desktopUseHostInstalled()) return;
  electronAxPrompted = true;
  try {
    const { requestElectronAccessibilityPrompt } = await import(
      "./appshot/service.js"
    );
    const granted = await requestElectronAccessibilityPrompt();
    mainLog(
      `[host-shortcuts] electron accessibility prompt granted=${granted ? 1 : 0}`,
    );
  } catch (error) {
    mainLog(
      `[host-shortcuts] electron accessibility prompt failed: ${error instanceof Error ? error.message : String(error)}`,
      "warn",
    );
  }
  if (tornDown) return;
  ensureElectronTap(api);
}

function startInjectDigitListener(api: ElectronApi): void {
  void import("./appshot/host-shift.js")
    .then(async (mod) => {
      if (tornDown) return;
      const handle = await mod.startHostShiftSocketListener(() => {}, {
        retryForever: true,
        onDigit: (digit) => emitDigitToFocusedWindow(api, digit),
      });
      if (tornDown) {
        handle?.stop();
        return;
      }
      if (handle) {
        injectListenStop = () => handle.stop();
        mainLog("[host-shortcuts] listening for inject digit swallows");
      }
    })
    .catch((error) => {
      mainLog(
        `[host-shortcuts] inject digit listener failed: ${error instanceof Error ? error.message : String(error)}`,
        "warn",
      );
    });
}

/**
 * Register focus/active listeners. Safe to call more than once; no-ops outside
 * Electron or on hosts where nothing is OS-reserved.
 */
export function installAppShortcutGuard(): void {
  if (installed) return;
  installed = true;

  const api = getElectronApi();
  if (!api) return;

  api.app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    installGuestDigitShortcutForward(contents);
  });

  if (osReservedShortcutChords().length === 0) return;

  native = loadNative();
  if (native) {
    nativePoll = setInterval(() => drainNative(api), 20);
    nativePoll.unref?.();
  }

  startInjectDigitListener(api);
  /* After the window is up: if Desktop Use is not installed, ask for Atmos
   * Accessibility so the in-process tap can swallow screenshot chords. */
  setTimeout(() => {
    void ensureElectronTapWithoutDesktopUse(api);
  }, 1500);

  const sync = () => setClaimEnabled(api, atmosIsActive(api));

  api.app.on("browser-window-focus", () => {
    ensureElectronTap(api);
    setClaimEnabled(api, true);
  });
  api.app.on("browser-window-blur", () => {
    setImmediate(() => {
      if (!api.BrowserWindow.getFocusedWindow()) setClaimEnabled(api, false);
    });
  });
  if (process.platform === "darwin") {
    api.app.on("did-become-active", () => {
      ensureElectronTap(api);
      if (!tapIsReady()) void ensureElectronTapWithoutDesktopUse(api);
      setClaimEnabled(api, true);
    });
    api.app.on("did-resign-active", () => setClaimEnabled(api, false));
  }
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    setClaimEnabled(api, false);
    try {
      injectListenStop?.();
    } catch {
      /* ignore */
    }
    injectListenStop = null;
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
  };

  api.app.on("will-quit", teardown);
  process.once("exit", teardown);

  sync();
}
