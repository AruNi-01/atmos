import { spawn } from "node:child_process";

export const HIDE_SIMULATOR_APP_SCRIPT = `
tell application "System Events"
  if exists process "Simulator" then
    tell process "Simulator"
      set visible to false
    end tell
  end if
end tell
`.trim();

export type HideWindowsResult =
  | { hidden: true }
  | { hidden: false; needsAutomation: boolean; message: string };

/**
 * Apple events MUST be sent from Electron main so Automation TCC is
 * attributed to Atmos, never to the helper process.
 */
export function hideSimulatorAppWindows(): Promise<HideWindowsResult> {
  if (process.platform !== "darwin") {
    return Promise.resolve({
      hidden: false,
      needsAutomation: false,
      message: "Hiding Simulator.app is only available on macOS",
    });
  }
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", HIDE_SIMULATOR_APP_SCRIPT], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ hidden: true });
        return;
      }
      const needsAutomation =
        /not authorized|(-1743)|not allowed/i.test(stderr);
      resolve({
        hidden: false,
        needsAutomation,
        message: stderr.trim() || "Could not hide Simulator.app windows",
      });
    });
    child.on("error", (error) => {
      resolve({
        hidden: false,
        needsAutomation: false,
        message: error.message,
      });
    });
  });
}
