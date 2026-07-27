/**
 * Limited preload for untrusted preview target pages.
 * Only exposes invoke for preview_bridge_event — never full desktop IPC.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__ATMOS_PREVIEW_INVOKE__", async (
  cmd: string,
  args?: Record<string, unknown>,
) => {
  if (cmd !== "preview_bridge_event") {
    throw new Error("Preview surface may only invoke preview_bridge_event");
  }
  const result = await ipcRenderer.invoke("atmos:desktop-invoke", {
    cmd,
    args: args ?? {},
  });
  if (result && typeof result === "object" && "ok" in result) {
    if ((result as { ok: boolean }).ok) {
      return (result as { data: unknown }).data;
    }
    const err = new Error(
      String((result as { error?: { message?: string } }).error?.message ?? "invoke failed"),
    );
    throw err;
  }
  return result;
});
