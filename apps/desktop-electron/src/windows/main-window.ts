import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import type { AppState } from "../app-state.js";
import { APP_PRODUCT_NAME, appWindowBranding } from "../branding.js";
import { installBrowserWebviewHooks } from "../browser/webview-hooks.js";
import { mainLog, mainLogPath } from "../main-log.js";
import { probeDesktopUi } from "../runtime/ensure.js";
import {
  errorPageDataUrl,
  formatUnknownError,
  type DesktopErrorView,
} from "./error-page.js";
import { macWindowChromeOptions } from "./mac-chrome.js";
import { wireFullscreenEvents } from "./fullscreen.js";
import { wireMainWindowCloseBehavior } from "./close-behavior.js";
import { pinMacDockAfterBoot } from "./mac-dock.js";
import { resolveAppPreloadPath } from "./preload-path.js";

function baseWindowOptions(preload: string | undefined) {
  return {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false as const,
    ...appWindowBranding(APP_PRODUCT_NAME),
    ...macWindowChromeOptions("primary"),
    backgroundColor: "#06070b",
    webPreferences: {
      ...(preload
        ? {
            preload,
            // APP-053: in-DOM browser guests; attach is default-deny via will-attach-webview.
            webviewTag: true as const,
          }
        : { webviewTag: false as const }),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // macOS: nested overflow:auto rubber-banding. Default is false.
      scrollBounce: true,
    },
  };
}

function attachShellLifecycle(state: AppState, win: BrowserWindow): void {
  wireFullscreenEvents(win);
  // Close button hides/minimizes (keep process); Cmd+Q still quits fully.
  wireMainWindowCloseBehavior(win);

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    // Soft show is not enough on macOS 26 — tile can stay Accessibility 0×N
    // (looks like a tiny/missing Dock icon while DMG/Finder still show full art).
    void pinMacDockAfterBoot();
  });

  if (process.env.ATMOS_ELECTRON_OPEN_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.on("closed", () => {
    if (state.mainWindow === win) state.mainWindow = null;
  });

  state.mainWindow = win;
}

export function showErrorInMainWindow(
  state: AppState,
  view: DesktopErrorView,
): BrowserWindow {
  const existing =
    state.mainWindow && !state.mainWindow.isDestroyed()
      ? state.mainWindow
      : null;
  const win =
    existing ??
    new BrowserWindow(
      baseWindowOptions(undefined) as Electron.BrowserWindowConstructorOptions,
    );

  if (!existing) {
    attachShellLifecycle(state, win);
  }

  const fullView: DesktopErrorView = {
    ...view,
    logPath: view.logPath ?? mainLogPath(),
  };
  const url = errorPageDataUrl(fullView);
  mainLog(`[ui] error page: ${view.title} — ${view.summary}`, "error");
  void win.loadURL(url).then(() => {
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  });
  return win;
}

export function createMainWindow(state: AppState, uiUrl: string): BrowserWindow {
  const preload = resolveAppPreloadPath();
  console.log(
    `[desktop-electron] main preload=${preload} exists=${existsSync(preload)}`,
  );

  const win = new BrowserWindow(
    baseWindowOptions(preload) as Electron.BrowserWindowConstructorOptions,
  );

  attachShellLifecycle(state, win);

  if (state.browser) {
    installBrowserWebviewHooks(win, state.browser);
  }

  // Network / cert failures on the product UI — surface instead of a black frame.
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      // -3 = ABORTED (e.g. navigation superseded); ignore.
      if (errorCode === -3) return;
      if (validatedURL.startsWith("data:")) return;
      showErrorInMainWindow(state, {
        title: "Could not load Atmos",
        summary: `Failed to open ${validatedURL || uiUrl}`,
        details: [
          `errorCode: ${errorCode}`,
          `description: ${errorDescription}`,
          `url: ${validatedURL || uiUrl}`,
          `api: ${state.apiHost}:${state.apiPort ?? "?"}`,
        ].join("\n"),
      });
    },
  );

  void win.loadURL(uiUrl);
  win.webContents.on("did-finish-load", () => {
    const loaded = win.webContents.getURL();
    if (loaded.startsWith("data:")) return;
    void win.webContents
      .executeJavaScript(
        `Boolean(window.__ATMOS_DESKTOP__ && window.__ATMOS_DESKTOP__.shell === 'electron')`,
      )
      .then((ok) => {
        console.log(`[desktop-electron] __ATMOS_DESKTOP__ present=${ok}`);
        if (!ok) {
          console.error(
            "[desktop-electron] preload bridge missing — header AppShot/Computer and native browser will not work",
          );
        }
      })
      .catch((e) => {
        console.error("[desktop-electron] bridge probe failed", e);
      });
  });

  return win;
}

/**
 * Confirm the runtime serves HTML before loadURL (404 still "finishes" load → black screen).
 */
export async function assertDesktopUiReady(
  state: AppState,
): Promise<{ uiUrl: string }> {
  if (state.apiPort == null) {
    throw new Error("API not ready");
  }
  const base = uiBaseUrl(state);
  const uiUrl = `${base}/`;
  const probe = await probeDesktopUi(state.apiHost, state.apiPort);
  if (!probe.ok) {
    throw new Error(
      [
        `Desktop UI is not available at ${uiUrl}`,
        probe.reason,
        probe.status != null ? `HTTP status: ${probe.status}` : null,
        probe.contentType ? `content-type: ${probe.contentType}` : null,
        probe.sample ? `body sample: ${probe.sample}` : "body sample: (empty)",
        `api host/port: ${state.apiHost}:${state.apiPort}`,
      ]
        .filter((line): line is string => line != null)
        .join("\n"),
    );
  }
  return { uiUrl };
}

export function createMainWindowOrError(
  state: AppState,
  err: unknown,
  title = "Atmos could not start",
): BrowserWindow {
  return showErrorInMainWindow(state, {
    title,
    summary: err instanceof Error ? err.message.split("\n")[0]! : String(err),
    details: formatUnknownError(err),
  });
}

export function uiBaseUrl(state: AppState): string {
  if (state.apiPort == null) {
    throw new Error("API not ready");
  }
  return `http://${state.apiHost}:${state.apiPort}`;
}
