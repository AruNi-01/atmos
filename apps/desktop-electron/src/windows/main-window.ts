import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import type { AppState } from "../app-state.js";
import { APP_PRODUCT_NAME, appWindowBranding } from "../branding.js";
import { macWindowChromeOptions } from "./mac-chrome.js";
import { wireFullscreenEvents } from "./fullscreen.js";
import { wireMainWindowCloseBehavior } from "./close-behavior.js";
import { resolveAppPreloadPath } from "./preload-path.js";

export function createMainWindow(state: AppState, uiUrl: string): BrowserWindow {
  const preload = resolveAppPreloadPath();
  console.log(`[desktop-electron] main preload=${preload} exists=${existsSync(preload)}`);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...appWindowBranding(APP_PRODUCT_NAME),
    ...macWindowChromeOptions("primary"),
    backgroundColor: "#06070b",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireFullscreenEvents(win);
  // Close button hides/minimizes (keep process); Cmd+Q still quits fully.
  wireMainWindowCloseBehavior(win);

  void win.loadURL(uiUrl);
  win.webContents.on("did-finish-load", () => {
    void win.webContents
      .executeJavaScript(
        `Boolean(window.__ATMOS_DESKTOP__ && window.__ATMOS_DESKTOP__.shell === 'electron')`,
      )
      .then((ok) => {
        console.log(`[desktop-electron] __ATMOS_DESKTOP__ present=${ok}`);
        if (!ok) {
          console.error(
            "[desktop-electron] preload bridge missing — header AppShot/Computer and native preview will not work",
          );
        }
      })
      .catch((e) => {
        console.error("[desktop-electron] bridge probe failed", e);
      });
  });

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  if (process.env.ATMOS_ELECTRON_OPEN_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.on("closed", () => {
    if (state.mainWindow === win) state.mainWindow = null;
  });

  state.mainWindow = win;
  return win;
}

export function uiBaseUrl(state: AppState): string {
  if (state.apiPort == null) {
    throw new Error("API not ready");
  }
  return `http://${state.apiHost}:${state.apiPort}`;
}
