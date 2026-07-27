import type { BrowserWindow } from "electron";
import type { PreviewSurfaceManager } from "./preview/surface-manager.js";
import type { TunnelService } from "./tunnel/service.js";

export type AppState = {
  apiHost: string;
  apiPort: number | null;
  mainWindow: BrowserWindow | null;
  preview: PreviewSurfaceManager | null;
  tunnel: TunnelService | null;
  /** Whether this Electron process started the Server (vs reused existing). */
  startedServer: boolean;
};

export function createAppState(): AppState {
  return {
    apiHost: "127.0.0.1",
    apiPort: null,
    mainWindow: null,
    preview: null,
    tunnel: null,
    startedServer: false,
  };
}
