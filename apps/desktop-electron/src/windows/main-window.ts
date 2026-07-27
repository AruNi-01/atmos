import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppState } from "../app-state.js";
import { APP_PRODUCT_NAME, appWindowBranding } from "../branding.js";
import { macWindowChromeOptions } from "./mac-chrome.js";
import { wireFullscreenEvents } from "./fullscreen.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, "preload.js"),
    resolve(process.cwd(), "dist/preload.js"),
    resolve(process.cwd(), "apps/desktop-electron/dist/preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function createMainWindow(state: AppState, uiUrl: string): BrowserWindow {
  const preload = resolvePreloadPath();
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
