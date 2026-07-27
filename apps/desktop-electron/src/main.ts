/**
 * Atmos Desktop — Electron shell (APP-045).
 * Does not load Tauri. Production default remains apps/desktop.
 */

import { app, ipcMain } from "electron";
import { createAppState } from "./app-state.js";
import {
  applyEarlyAppBranding,
  applyReadyAppBranding,
} from "./branding.js";
import { ensureAtmosServer } from "./runtime/ensure.js";
import { createDesktopCommandRouter } from "./ipc/router.js";
import { createAllHandlers } from "./ipc/handlers.js";
import { createMainWindow, uiBaseUrl } from "./windows/main-window.js";
import { PreviewSurfaceManager } from "./preview/surface-manager.js";
import {
  TunnelService,
  type ProviderKind,
} from "./tunnel/service.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Before ready: menu / process name → "Atmos" instead of "Electron".
applyEarlyAppBranding();

const state = createAppState();
let router = createDesktopCommandRouter(createAllHandlers(state));

/** Shared boot promise so whenReady + activate cannot double-start services. */
let bootPromise: Promise<void> | null = null;

function registerIpc() {
  ipcMain.removeHandler("atmos:desktop-invoke");
  ipcMain.handle("atmos:desktop-invoke", async (event, payload) => {
    const cmd = (payload as { cmd?: string })?.cmd ?? "";
    const args = {
      ...((payload as { args?: Record<string, unknown> })?.args ?? {}),
      // Internal: let preview_bridge_* attach WebContentsView to the invoking window
      // (standalone browser) instead of always using main. Not a public API.
      __electronSenderWebContentsId: event.sender.id,
    };
    return router.invokeSafe(cmd, args);
  });
}

function servicesReady(): boolean {
  return (
    state.apiPort != null &&
    state.preview != null &&
    state.tunnel != null
  );
}

function ensureMainWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.show();
    state.mainWindow.focus();
    return;
  }
  const uiUrl = `${uiBaseUrl(state)}/`;
  createMainWindow(state, uiUrl);
  console.log(`[desktop-electron] main window ${uiUrl}`);
}

async function boot() {
  registerIpc();
  applyReadyAppBranding();

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

  // Only create services once — activate must not clobber live tunnels/previews.
  if (!state.preview) {
    state.preview = new PreviewSurfaceManager(state);
  }
  if (!state.tunnel) {
    state.tunnel = new TunnelService();
  }
  // rebuild handlers with services attached
  router = createDesktopCommandRouter(createAllHandlers(state));
  registerIpc();

  ensureMainWindow();
}

function bootOnce(): Promise<void> {
  if (!bootPromise) {
    bootPromise = boot().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}

/** Await every provider stop so Tailscale reset finishes before process exit. */
async function stopAllTunnelsBeforeExit(): Promise<void> {
  const tunnel = state.tunnel;
  if (!tunnel) return;
  const providers: ProviderKind[] = ["cloudflare", "ngrok", "tailscale"];
  for (const p of providers) {
    try {
      await tunnel.stop(p);
    } catch (err) {
      console.error(
        `[desktop-electron] tunnel stop on quit failed (${p}):`,
        err,
      );
    }
  }
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
    bootOnce().catch((err) => {
      console.error("[desktop-electron] boot failed:", err);
      app.exit(1);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.show();
      state.mainWindow.focus();
      return;
    }
    // Services already up (e.g. dock click after all windows closed on macOS):
    // only recreate the main window — do not rebuild preview/tunnel.
    if (servicesReady()) {
      try {
        ensureMainWindow();
      } catch (err) {
        console.error("[desktop-electron] recreate main window failed:", err);
      }
      return;
    }
    bootOnce().catch(console.error);
  });

  // Async quit: preventDefault, await tunnel teardown, then exit.
  // (Fire-and-forget stop() races process exit before Tailscale reset.)
  let isQuitting = false;
  app.on("before-quit", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    void (async () => {
      try {
        await stopAllTunnelsBeforeExit();
      } finally {
        app.exit(0);
      }
    })();
  });
}

// Export for headless tests
export { createAllHandlers, createDesktopCommandRouter, state };
