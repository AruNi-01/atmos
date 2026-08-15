import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const requireElectron = createRequire(import.meta.url);

/** Override for tests. Production leaves this unset so the OS Downloads folder is used. */
export const DOWNLOAD_ROOT_ENV = "ATMOS_BROWSER_USE_DOWNLOADS";

/** System Downloads folder (`app.getPath("downloads")`), not `~/.atmos`. */
export function systemDownloadsDir(): string {
  const fromEnv = process.env[DOWNLOAD_ROOT_ENV]?.trim();
  if (fromEnv) return resolve(fromEnv);
  try {
    const electron = requireElectron("electron") as typeof import("electron");
    if (electron.app?.isReady?.()) {
      return electron.app.getPath("downloads");
    }
  } catch {
    /* unit tests, or Electron not ready */
  }
  return join(homedir(), "Downloads");
}
