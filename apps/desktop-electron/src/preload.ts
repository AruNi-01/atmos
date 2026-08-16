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
      // Throw a plain object — not `Error`. Electron's contextBridge only keeps
      // Error.message when rethrowing into the renderer, so typed command codes
      // (BrowserRunning, KeychainDenied, …) were lost and the cookie UI always
      // showed the generic "Something went wrong" Unknown string.
      throw {
        name: "DesktopCommandError",
        message: r.error?.message ?? "Desktop invoke failed",
        code: r.error?.code ?? "DESKTOP_ERROR",
        command: r.error?.command ?? cmd,
      };
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

  terminalStream: {
    open(url: string) {
      return ipcRenderer.invoke("atmos:terminal-stream-open", { url }) as Promise<{
        streamId: string;
        sidecar?: "uds" | "ws";
      }>;
    },
    send(streamId: string, data: ArrayBuffer | string) {
      ipcRenderer.send("atmos:terminal-stream-send", streamId, data);
    },
    close(streamId: string) {
      ipcRenderer.send("atmos:terminal-stream-close", streamId);
    },
  },
});
