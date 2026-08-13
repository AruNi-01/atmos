import type { BrowserWindow } from "electron";
import type { BrowserSurfaceManager } from "./browser/surface-manager.js";
import type { BrowserUseControlPlane } from "./browser/browser-use-control.js";
import type { TunnelService } from "./tunnel/service.js";
import type { SimulatorBridge } from "./simulator/bridge.js";

export type AppState = {
  apiHost: string;
  apiPort: number | null;
  mainWindow: BrowserWindow | null;
  browser: BrowserSurfaceManager | null;
  /** Loopback control plane for `atmos browser-use --backend embedded`. */
  browserUseControl: BrowserUseControlPlane | null;
  /** Workspace Simulator (APP-058) — loopback control plane + helper sessions. */
  simulator: SimulatorBridge | null;
  tunnel: TunnelService | null;
  /** Whether this Electron process started the Server (vs reused existing). */
  startedServer: boolean;
};

export function createAppState(): AppState {
  return {
    apiHost: "127.0.0.1",
    apiPort: null,
    mainWindow: null,
    browser: null,
    browserUseControl: null,
    simulator: null,
    tunnel: null,
    startedServer: false,
  };
}
