/**
 * Desktop Use process lifecycle for the Electron shell.
 *
 * The control-engine host is a detached daemon (not a child of Atmos).
 * Real quit (Cmd+Q / before-quit) must stop it; hiding the window must not.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mainLog } from "../main-log.js";
import { desktopUseDriverStop, isAtmosCliInstalled } from "./client.js";

const execFileAsync = promisify(execFile);

/** Same `pkill -f` needle as `crates/desktop-use` `stop_daemon`. */
export const HOST_SERVE_PKILL_PATTERN =
  "Atmos Desktop Use.app/Contents/MacOS/.*serve";

const STOP_TIMEOUT_MS = 8_000;

export async function stopDesktopUseOnAppQuit(): Promise<void> {
  try {
    if (isAtmosCliInstalled()) {
      await desktopUseDriverStop(STOP_TIMEOUT_MS);
    }
  } catch (e) {
    mainLog(
      `[quit] desktop-use driver stop failed: ${e instanceof Error ? e.message : String(e)}`,
      "warn",
    );
  }

  if (process.platform === "darwin") {
    try {
      await execFileAsync("pkill", ["-f", HOST_SERVE_PKILL_PATTERN], {
        timeout: 3_000,
      });
    } catch {
      // pkill exits 1 when nothing matched.
    }
  }
}
