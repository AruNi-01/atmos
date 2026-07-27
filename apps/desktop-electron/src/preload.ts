import { contextBridge, ipcRenderer } from "electron";

/**
 * First-party desktop bridge for apps/web desktop-bridge.ts
 */
contextBridge.exposeInMainWorld("__ATMOS_DESKTOP__", {
  shell: "electron" as const,

  async invoke(cmd: string, args?: Record<string, unknown>) {
    const result = await ipcRenderer.invoke("atmos:desktop-invoke", {
      cmd,
      args: args ?? {},
    });
    if (result && typeof result === "object" && "ok" in result) {
      const r = result as {
        ok: boolean;
        data?: unknown;
        error?: { message?: string; code?: string; command?: string };
      };
      if (r.ok) return r.data;
      const err = new Error(r.error?.message ?? "Desktop invoke failed") as Error & {
        code?: string;
        command?: string;
      };
      err.code = r.error?.code ?? "DESKTOP_ERROR";
      err.command = r.error?.command ?? cmd;
      throw err;
    }
    return result;
  },

  on(event: string, handler: (payload: unknown) => void) {
    const channel = `atmos:desktop-event:${event}`;
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => {
      handler(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});
