/**
 * Atmos Desktop — production Electron shell.
 * Does not load Tauri. Legacy Tauri lives under apps/desktop for non-regression.
 */

import { app, ipcMain } from "electron";
import { createAppState } from "./app-state.js";
import {
  applyEarlyAppBranding,
  applyReadyAppBranding,
} from "./branding.js";
import { installDevToolsPolicy } from "./devtools-policy.js";
import { ensureAtmosServer } from "./runtime/ensure.js";
import { createDesktopCommandRouter } from "./ipc/router.js";
import { createAllHandlers } from "./ipc/handlers.js";
import {
  assertDesktopUiReady,
  createMainWindow,
  createMainWindowOrError,
} from "./windows/main-window.js";
import { markAllowWindowDestroy } from "./windows/close-behavior.js";
import {
  ensureMacDockVisible,
  pinMacDockAfterBoot,
} from "./windows/mac-dock.js";
import { BrowserSurfaceManager } from "./browser/surface-manager.js";
import { BrowserUseControlPlane } from "./browser/browser-use-control.js";
import { SimulatorBridge } from "./simulator/bridge.js";
import { ALL_PROVIDERS, TunnelService } from "./tunnel/service.js";
import { mainLog, mainLogPath } from "./main-log.js";
import { formatUnknownError } from "./windows/error-page.js";

// Before ready: menu / process name → "Atmos" instead of "Electron".
applyEarlyAppBranding();
// Release builds: block Option+Cmd+I / Ctrl+Shift+I / F12 before any webContents exists.
installDevToolsPolicy();
mainLog(`[boot] main process start log=${mainLogPath()}`);

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
      // Internal: prefer the invoking window (standalone browser) for host context.
      // Not a public API.
      __electronSenderWebContentsId: event.sender.id,
    };
    return router.invokeSafe(cmd, args);
  });
}

function servicesReady(): boolean {
  return (
    state.apiPort != null &&
    state.browser != null &&
    state.tunnel != null
  );
}

async function ensureMainWindow(): Promise<void> {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.show();
    state.mainWindow.focus();
    return;
  }
  const { uiUrl } = await assertDesktopUiReady(state);
  createMainWindow(state, uiUrl);
  console.log(`[desktop-electron] main window ${uiUrl}`);
  mainLog(`[boot] main window ${uiUrl}`);
}

async function boot() {
  registerIpc();
  applyReadyAppBranding();

  console.log("[desktop-electron] ensuring Atmos Server…");
  mainLog("[boot] ensuring Atmos Server…");
  const runtime = await ensureAtmosServer();
  state.apiHost = runtime.host;
  state.apiPort = runtime.port;
  state.startedServer = runtime.started;
  console.log(
    `[desktop-electron] API ${state.apiHost}:${state.apiPort} started=${runtime.started}`,
  );
  mainLog(
    `[boot] API ${state.apiHost}:${state.apiPort} started=${runtime.started} webDir=${runtime.webDir}`,
  );

  // Only create services once — activate must not clobber live tunnels/previews.
  if (!state.browser) {
    state.browser = new BrowserSurfaceManager(state);
  }
  if (!state.browserUseControl && state.browser) {
    state.browserUseControl = new BrowserUseControlPlane(state.browser);
    state.browserUseControl.start();
  }
  if (!state.simulator) {
    const { BrowserWindow, shell, app: electronApp } = await import("electron");
    const hostAppPath = (() => {
      const exe = process.execPath;
      const idx = exe.indexOf(".app/");
      return idx >= 0 ? exe.slice(0, idx + 4) : exe;
    })();
    state.simulator = new SimulatorBridge({
      emit: (event, payload) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(`atmos:desktop-event:${event}`, payload);
          }
        }
      },
      openExternal: async (url) => {
        await shell.openExternal(url);
      },
      focusApp: () => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.show();
          state.mainWindow.focus();
        }
      },
      showAutomationGrant: () => {
        void import("./desktop-use/grant-overlay.js").then(({ showAccessibilityGrantOverlay }) => {
          showAccessibilityGrantOverlay({
            hostAppPath,
            hostAppName: electronApp.getName() || "Atmos",
            purpose: "automation",
          });
        });
      },
      resourcesPath:
        typeof process.resourcesPath === "string" ? process.resourcesPath : undefined,
    });
    state.simulator.start();
  }
  if (!state.tunnel) {
    state.tunnel = new TunnelService();
  }
  // rebuild handlers with services attached
  router = createDesktopCommandRouter(createAllHandlers(state));
  registerIpc();

  await ensureMainWindow();

  // Background: if control engine is installed but behind the Atmos pin, force
  // ensure without blocking UI. First-time install stays user-initiated.
  try {
    const { scheduleDesktopUseEngineAutoUpdate } = await import(
      "./desktop-use/auto-update.js"
    );
    scheduleDesktopUseEngineAutoUpdate();
  } catch (e) {
    mainLog(
      `[boot] desktop-use auto-update schedule failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Arm Appshots Left+Right Shift global gesture (macOS). Always attempt on boot.
  if (process.platform === "darwin") {
    // Do NOT warm the capture overlay BrowserWindow at boot — creating that
    // always-on-top surface (historically type:"panel") leaves a zero-width
    // Dock tile so Atmos appears icon-less next to 豆包 / Downloads.
    // First dual-shift creates the overlay lazily.
    try {
      const appshot = await import("./appshot/service.js");
      const status = await appshot.appshotStatus(state);
      mainLog(
        `[boot] appshot arm trigger.enabled=${status.trigger.enabled} last_error=${status.trigger.last_error ?? "null"} ax=${status.permissions.find((p) => p.name === "accessibility")?.granted} screen=${status.permissions.find((p) => p.name === "screen_recording")?.granted}`,
      );
    } catch (err) {
      mainLog(
        `[boot] Appshots trigger arm failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
    // Pin Dock after boot work (trigger arm, etc.) in case anything dismissed it.
    // Hard recycle + retries — soft show alone leaves 0-width tiles on macOS 26.
    void pinMacDockAfterBoot();
  }
}

function presentBootFailure(err: unknown): void {
  const details = formatUnknownError(err);
  mainLog(`[boot] failed: ${details}`, "error");
  console.error("[desktop-electron] boot failed:", err);
  try {
    applyReadyAppBranding();
    createMainWindowOrError(state, err);
  } catch (showErr) {
    mainLog(
      `[boot] could not show error window: ${formatUnknownError(showErr)}`,
      "error",
    );
    // Last resort — no silent exit without a chance to read the log path.
    console.error(
      `[desktop-electron] fatal boot failure (see ${mainLogPath()}):`,
      err,
    );
  }
}

function bootOnce(): Promise<void> {
  if (!bootPromise) {
    bootPromise = boot().catch((err) => {
      bootPromise = null;
      presentBootFailure(err);
    });
  }
  return bootPromise;
}

/** Await every provider stop so Tailscale reset finishes before process exit. */
async function stopAllTunnelsBeforeExit(): Promise<void> {
  const tunnel = state.tunnel;
  if (!tunnel) return;
  for (const p of ALL_PROVIDERS) {
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
    void ensureMacDockVisible();
    state.mainWindow?.show();
    state.mainWindow?.focus();
  });

  app.whenReady().then(() => {
    void bootOnce();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    // Dock / taskbar click: restore existing window without reloading when possible.
    void ensureMacDockVisible();
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      if (state.mainWindow.isMinimized()) {
        state.mainWindow.restore();
      }
      state.mainWindow.show();
      state.mainWindow.focus();
      return;
    }
    // Window was fully destroyed (Quit path or crash): recreate shell only.
    if (servicesReady()) {
      void ensureMainWindow().catch((err) => {
        console.error("[desktop-electron] recreate main window failed:", err);
        presentBootFailure(err);
      });
      return;
    }
    void bootOnce();
  });

  // Async quit: preventDefault, await tunnel teardown, then exit.
  // (Fire-and-forget stop() races process exit before Tailscale reset.)
  let isQuitting = false;
  app.on("before-quit", (event) => {
    if (isQuitting) return;
    // Allow main-window close to destroy instead of hide-to-background.
    markAllowWindowDestroy();
    event.preventDefault();
    isQuitting = true;
    void (async () => {
      try {
        try {
          state.browserUseControl?.stop();
        } catch {
          /* ignore */
        }
        try {
          state.simulator?.stop();
        } catch {
          /* ignore */
        }
        if (process.platform === "darwin") {
          try {
            const { stopTriggerListener } = await import("./appshot/trigger.js");
            stopTriggerListener();
          } catch {
            /* ignore */
          }
        }
        await stopAllTunnelsBeforeExit();
        // Production ownership: stop Server only when this process started it.
        try {
          const { stopOwnedAtmosServer } = await import("./runtime/ensure.js");
          const result = stopOwnedAtmosServer();
          if (result.stopped) {
            console.log(
              `[desktop-electron] stopped owned Atmos Server pid=${result.pid} (${result.reason})`,
            );
          }
        } catch (err) {
          console.warn("[desktop-electron] stop owned Server failed:", err);
        }
      } finally {
        app.exit(0);
      }
    })();
  });
}

// Export for headless tests
export { createAllHandlers, createDesktopCommandRouter, state };
