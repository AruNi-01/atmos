/**
 * Background Desktop Use control-engine auto-update.
 *
 * On desktop boot: if the engine is already installed and the Atmos-pinned
 * version differs from the installed pin, force-ensure in the background.
 * Never auto-installs for first-time users (large download + TCC UX).
 */

import { mainLog } from "../main-log.js";
import type { DesktopUseStatusJson } from "./client.js";

let scheduled = false;
let inflight: Promise<void> | null = null;

/**
 * Fire-and-forget once per process. Safe to call multiple times.
 */
export function scheduleDesktopUseEngineAutoUpdate(): void {
  if (scheduled) return;
  scheduled = true;
  // Defer past first paint / boot-critical path.
  setTimeout(() => {
    inflight = runAutoUpdate().finally(() => {
      inflight = null;
    });
    void inflight;
  }, 3_000);
}

/** Test / diagnostics: wait for in-flight auto-update if any. */
export function desktopUseEngineAutoUpdateInflight(): Promise<void> | null {
  return inflight;
}

async function runAutoUpdate(): Promise<void> {
  try {
    const client = await import("./client.js");
    let status: DesktopUseStatusJson;
    try {
      status = await client.desktopUseStatus();
    } catch (e) {
      mainLog(
        `[desktop-use] auto-update: status failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }

    if (status?.cli?.installed === false) {
      mainLog(
        "[desktop-use] auto-update: skip (Atmos CLI not installed)",
      );
      return;
    }
    if (status?.cli?.update_required === true) {
      mainLog(
        "[desktop-use] auto-update: skip (Atmos CLI below package min_cli_version)",
      );
      return;
    }

    const installed = Boolean(status?.driver?.installed);
    const updateAvailable = Boolean(status?.update_available);
    const installedV =
      status?.installed_version ?? status?.driver?.engine_version ?? null;
    const pinnedV = status?.pinned_version ?? null;

    if (!installed) {
      mainLog(
        "[desktop-use] auto-update: skip (not installed — user must Install)",
      );
      return;
    }
    if (!updateAvailable) {
      mainLog(
        `[desktop-use] auto-update: skip (up to date installed=${installedV ?? "?"} pin=${pinnedV ?? "?"})`,
      );
      return;
    }

    mainLog(
      `[desktop-use] auto-update: starting force ensure ${installedV ?? "?"} → ${pinnedV ?? "?"}`,
    );
    const result = (await client.desktopUseDriverEnsure(true)) as {
      ok?: boolean;
      action?: string;
      error?: string;
    };
    if (result && result.ok === false) {
      mainLog(
        `[desktop-use] auto-update: ensure failed: ${result.error ?? "unknown"}`,
      );
      return;
    }
    mainLog(
      `[desktop-use] auto-update: done action=${result?.action ?? "ensure"} pin=${pinnedV ?? "?"}`,
    );
  } catch (e) {
    mainLog(
      `[desktop-use] auto-update: unexpected error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
