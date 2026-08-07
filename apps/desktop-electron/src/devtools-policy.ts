/**
 * DevTools policy for the production Electron shell.
 *
 * Packaged (release) apps must not open **Atmos shell** DevTools via
 * Option+Cmd+I / Ctrl+Shift+I / F12 / menu accelerators. Dev and unpackaged
 * runs keep shell DevTools available.
 *
 * **Atmos Browser** guests are intentionally exempt: the in-app browser
 * toolbar DevTools control and guest shortcuts must work in release so users
 * can inspect pages they browse (not the Atmos product UI).
 *
 * Escape hatches for shell DevTools (support / dogfood):
 * - ATMOS_ELECTRON_ALLOW_DEVTOOLS=1
 * - ATMOS_ELECTRON_OPEN_DEVTOOLS=1
 *
 * Note: electron is resolved via createRequire so unit tests (bun, no Electron
 * runtime) can import pure helpers without loading the Electron binary path.
 */

import { createRequire } from "node:module";
import type { Input, WebContents } from "electron";
import { BROWSER_PARTITION } from "./browser/webview-attach-policy.js";

const nodeRequire = createRequire(import.meta.url);

type ElectronApi = typeof import("electron");

let installed = false;

function getElectronApi(): ElectronApi | null {
  // Outside Electron (bun tests, node): package exports a binary path string.
  if (typeof process.versions.electron !== "string") return null;
  try {
    const mod = nodeRequire("electron") as ElectronApi | string;
    if (typeof mod === "string" || !mod?.app) return null;
    return mod;
  } catch {
    return null;
  }
}

/**
 * Whether the current process is a packaged release build.
 * Mirrors `app.isPackaged` when Electron is available.
 */
export function isPackagedApp(): boolean {
  const api = getElectronApi();
  if (api) return api.app.isPackaged;
  return false;
}

/**
 * True when keyboard / menu may open **Atmos shell** DevTools.
 * Browser guest DevTools are not gated by this flag (see `isBrowserWebContents`).
 */
export function areDevToolsAllowed(): boolean {
  if (process.env.ATMOS_ELECTRON_ALLOW_DEVTOOLS === "1") return true;
  if (process.env.ATMOS_ELECTRON_OPEN_DEVTOOLS === "1") return true;
  return !isPackagedApp();
}

/**
 * Atmos Browser content: in-DOM `<webview>` guests and detached browser windows
 * on `persist:atmos-browser`. These may always open page DevTools in release.
 */
export function isBrowserWebContents(contents: WebContents): boolean {
  try {
    if (contents.getType() === "webview") return true;
  } catch {
    /* ignore */
  }

  const api = getElectronApi();
  if (!api?.session) return false;
  try {
    const browserSession = api.session.fromPartition(BROWSER_PARTITION);
    return contents.session === browserSession;
  } catch {
    return false;
  }
}

/**
 * Chromium / Electron default DevTools toggle shortcuts.
 * Pure helper so unit tests do not need a running Electron app.
 */
export function isDevToolsToggleShortcut(
  input: Pick<Input, "type" | "key" | "meta" | "alt" | "control" | "shift">,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (input.type !== "keyDown") return false;

  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;

  // F12 — all platforms
  if (key === "F12") return true;

  // macOS: Option+Cmd+I / J / C (Elements inspect)
  if (platform === "darwin") {
    if (
      input.meta &&
      input.alt &&
      !input.control &&
      (key === "i" || key === "j" || key === "c")
    ) {
      return true;
    }
    return false;
  }

  // Windows / Linux: Ctrl+Shift+I / J / C
  if (
    input.control &&
    input.shift &&
    !input.meta &&
    (key === "i" || key === "j" || key === "c")
  ) {
    return true;
  }

  return false;
}

function enforceOnWebContents(contents: WebContents): void {
  // Browser page DevTools stay available in release (toolbar + guest shortcuts).
  if (isBrowserWebContents(contents)) return;

  contents.on("before-input-event", (event, input) => {
    if (areDevToolsAllowed()) return;
    if (isDevToolsToggleShortcut(input)) {
      event.preventDefault();
    }
  });

  // Menu roles / programmatic openDevTools bypass before-input-event.
  contents.on("devtools-opened", () => {
    if (areDevToolsAllowed()) return;
    try {
      contents.closeDevTools();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Register once, before any BrowserWindow / WebContentsView is created.
 * Blocks Atmos shell DevTools in packaged builds; leaves browser guests alone.
 */
export function installDevToolsPolicy(): void {
  if (installed) return;
  installed = true;

  const api = getElectronApi();
  if (!api) {
    console.warn(
      "[desktop-electron] installDevToolsPolicy: Electron API unavailable",
    );
    return;
  }

  api.app.on("web-contents-created", (_event, contents) => {
    enforceOnWebContents(contents);
  });
}
