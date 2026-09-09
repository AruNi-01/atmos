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
 * Never prompt Accessibility at boot (no system lock dialog).
 * If the tap is not ready, the first screenshot UI (screencaptureui window
 * or process) while Atmos was frontmost opens the drag-to-list overlay on
 * the left sidebar, then flies it to System Settings. Settings → Privacy
 * Grant uses the same overlay.
 *
 * Do not synthesize the key with sendInputEvent — that can re-trigger
 * Screenshot.app. Electron globalShortcut cannot preempt Screenshot.app.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);
const HOST_SHORTCUT_HOLD_MS = 640;

type ElectronApi = typeof import("electron");

type HostShortcutNative = {
  stop: () => void;
  setEnabled: (enabled: number) => void;
  takeDigit: () => number;
  takeAxNudge: () => number;
  tapReady: () => number;
};

let installed = false;
let native: HostShortcutNative | null = null;
let nativePoll: ReturnType<typeof setInterval> | null = null;
let enabled = false;
let tornDown = false;
let injectListenStop: (() => void) | null = null;
let screenshotWatch: ReturnType<typeof setInterval> | null = null;
let hostShortcutAxGrantStarted = false;
let hostShortcutAxGrantInFlight = false;
let lastAtmosContentBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;
let atmosSeenAt = 0;

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
    const takeAxNudge = lib.func("atmos_host_shortcuts_take_ax_nudge", "int", []) as () => number;
    const status = lib.func("atmos_host_shortcuts_status", "int", []) as () => number;
    const axTrusted = lib.func("atmos_host_shortcuts_ax_trusted", "int", []) as () => number;
    const tapReady = lib.func("atmos_host_shortcuts_tap_ready", "int", []) as () => number;
    const rc = start();
    const ax = axTrusted();
    const tap = tapReady();
    const st = status();
    // 2 = tap ready, 4 = observer running without AX. Keep the native so we
    // can detect the first screenshot steal and retry the tap after grant.
    if (st !== 2 && st !== 4 && !tap) {
      mainLog(
        `[host-shortcuts] electron tap unavailable rc=${rc} status=${st} ax=${ax}`,
        "warn",
      );
      try {
        stop();
      } catch {
        /* ignore */
      }
      return null;
    }
    mainLog(
      `[host-shortcuts] native ready dylib=${dylib} ax=${ax} tap=${tap ? 1 : 0} status=${st}`,
    );
    return { stop, setEnabled, takeDigit, takeAxNudge, tapReady };
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
  try {
    if (native.takeAxNudge() === 1) {
      void presentHostShortcutAxGrant(api);
    }
  } catch {
    /* older dylib without take_ax_nudge */
  }
}

function atmosIsActive(api: ElectronApi): boolean {
  return Boolean(api.BrowserWindow.getFocusedWindow());
}

function rememberAtmosBounds(api: ElectronApi): void {
  const win = api.BrowserWindow.getFocusedWindow();
  if (!win || win.isDestroyed()) return;
  try {
    lastAtmosContentBounds = win.getContentBounds();
    atmosSeenAt = Date.now();
  } catch {
    /* ignore */
  }
}

async function pgrepExact(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", name], {
      timeout: 400,
      maxBuffer: 4096,
    });
    return String(stdout).trim().length > 0;
  } catch {
    return false;
  }
}

async function screenshotUiRunning(): Promise<boolean> {
  return (
    (await pgrepExact("screencaptureui")) || (await pgrepExact("Screenshot"))
  );
}

function startScreenshotStealWatch(api: ElectronApi): void {
  if (process.platform !== "darwin" || screenshotWatch) return;
  let prevShot = false;
  let inFlight = false;
  screenshotWatch = setInterval(() => {
    if (tornDown || tapIsReady() || hostShortcutAxGrantStarted) return;
    if (atmosIsActive(api)) rememberAtmosBounds(api);
    if (inFlight) return;
    inFlight = true;
    void screenshotUiRunning()
      .then((shot) => {
        const recentAtmos = Date.now() - atmosSeenAt < 2500;
        if (shot && !prevShot && recentAtmos) {
          void presentHostShortcutAxGrant(api);
        }
        prevShot = shot;
      })
      .finally(() => {
        inFlight = false;
      });
  }, 200);
  screenshotWatch.unref?.();
}

function ensureElectronTap(api: ElectronApi): void {
  if (tornDown) return;
  if (!native) {
    native = loadNative();
    if (native && !nativePoll) {
      nativePoll = setInterval(() => drainNative(api), 20);
      nativePoll.unref?.();
    }
  }
  native?.setEnabled(enabled ? 1 : 0);
}

/**
 * First ⌘⇧3–6 while untrusted: show the drag-to-list overlay, never the
 * system Accessibility lock dialog. Once per session from this path.
 */
async function presentHostShortcutAxGrant(api: ElectronApi): Promise<void> {
  if (tornDown || tapIsReady()) return;
  if (hostShortcutAxGrantStarted || hostShortcutAxGrantInFlight) return;
  hostShortcutAxGrantStarted = true;
  hostShortcutAxGrantInFlight = true;
  try {
    const { grantAtmosAppPermission, leftSidebarGrantOrigin } = await import(
      "./macos-app-permissions.js"
    );
    const { grantPanelHeight } = await import("./desktop-use/grant-overlay.js");
    const locale =
      typeof api.app.getLocale === "function" ? api.app.getLocale() : undefined;
    const win =
      api.BrowserWindow.getFocusedWindow() ??
      api.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.isVisible(),
      ) ??
      null;
    let sourceOrigin: { x: number; y: number } | undefined;
    try {
      const bounds = lastAtmosContentBounds ?? win?.getContentBounds();
      if (bounds) {
        sourceOrigin = leftSidebarGrantOrigin(bounds, grantPanelHeight(true));
      }
    } catch {
      /* fly origin falls back */
    }
    const result = await grantAtmosAppPermission({
      target: "accessibility",
      locale,
      reason: "host_shortcuts",
      hostWindow: win,
      sourceOrigin,
      openSettings: "after",
      holdAtOriginMs: HOST_SHORTCUT_HOLD_MS,
    });
    mainLog(
      `[host-shortcuts] accessibility overlay ok=${result.ok ? 1 : 0} path=${result.app_path ?? "null"}`,
    );
    if (!result.ok) hostShortcutAxGrantStarted = false;
    const started = Date.now();
    while (!tornDown && Date.now() - started < 120_000) {
      ensureElectronTap(api);
      if (tapIsReady()) {
        try {
          const { closeAccessibilityGrantOverlay } = await import(
            "./desktop-use/grant-overlay.js"
          );
          closeAccessibilityGrantOverlay();
        } catch {
          /* overlay optional */
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (error) {
    hostShortcutAxGrantStarted = false;
    mainLog(
      `[host-shortcuts] accessibility overlay failed: ${error instanceof Error ? error.message : String(error)}`,
      "warn",
    );
  } finally {
    hostShortcutAxGrantInFlight = false;
    if (!tornDown) ensureElectronTap(api);
  }
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
  startScreenshotStealWatch(api);

  startInjectDigitListener(api);

  const sync = () => {
    rememberAtmosBounds(api);
    setClaimEnabled(api, atmosIsActive(api));
  };

  api.app.on("browser-window-focus", () => {
    ensureElectronTap(api);
    rememberAtmosBounds(api);
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
      rememberAtmosBounds(api);
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
    if (screenshotWatch) {
      clearInterval(screenshotWatch);
      screenshotWatch = null;
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
