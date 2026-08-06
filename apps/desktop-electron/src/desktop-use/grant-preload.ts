/**
 * Preload for the Accessibility grant panel.
 * startDrag must run synchronously during the renderer dragstart event.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("atmosGrant", {
  /** Sync IPC so main can call startDrag before dragstart returns. */
  startDrag() {
    return ipcRenderer.sendSync("desktop-use-grant-drag-start") as {
      ok?: boolean;
      error?: string;
    };
  },
  close() {
    ipcRenderer.send("desktop-use-grant-close");
  },
});
