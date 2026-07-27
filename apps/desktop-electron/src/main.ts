/**
 * Atmos Desktop — Electron shell (APP-045).
 * Does not load Tauri. Production default remains apps/desktop.
 */

import { app, ipcMain } from "electron";
import { createAppState } from "./app-state.js";
import { ensureAtmosServer } from "./runtime/ensure.js";
import { createDesktopCommandRouter } from "./ipc/router.js";
import { createAllHandlers } from "./ipc/handlers.js";
import { createMainWindow, uiBaseUrl } from "./windows/main-window.js";
import { PreviewSurfaceManager } from "./preview/surface-manager.js";
import { TunnelService } from "./tunnel/service.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const state = createAppState();
let router = createDesktopCommandRouter(createAllHandlers(state));

function registerIpc() {
  ipcMain.removeHandler("atmos:desktop-invoke");
  ipcMain.handle("atmos:desktop-invoke", async (_event, payload) => {
    const cmd = (payload as { cmd?: string })?.cmd ?? "";
    const args = (payload as { args?: Record<string, unknown> })?.args ?? {};
    return router.invokeSafe(cmd, args);
  });
}

async function boot() {
  registerIpc();

  console.log("[desktop-electron] ensuring Atmos Server…");
  const runtime = await ensureAtmosServer();
  state.apiHost = runtime.host;
  state.apiPort = runtime.port;
  state.startedServer = runtime.started;
  console.log(
    `[desktop-electron] API ${state.apiHost}:${state.apiPort} started=${runtime.started}`,
  );

  if (!runtime.webDir || !existsSync(join(runtime.webDir, "index.html"))) {
    throw new Error(
      `Desktop UI missing under ${runtime.webDir}. Run prepare-sidecar.`,
    );
  }

  state.preview = new PreviewSurfaceManager(state);
  state.tunnel = new TunnelService();
  // rebuild handlers with services attached
  router = createDesktopCommandRouter(createAllHandlers(state));
  registerIpc();

  const uiUrl = `${uiBaseUrl(state)}/`;
  createMainWindow(state, uiUrl);
  console.log(`[desktop-electron] main window ${uiUrl}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    state.mainWindow?.show();
    state.mainWindow?.focus();
  });

  app.whenReady().then(() => {
    boot().catch((err) => {
      console.error("[desktop-electron] boot failed:", err);
      app.exit(1);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (!state.mainWindow) {
      boot().catch(console.error);
    }
  });
}

// Export for headless tests
export { createAllHandlers, createDesktopCommandRouter, state };
