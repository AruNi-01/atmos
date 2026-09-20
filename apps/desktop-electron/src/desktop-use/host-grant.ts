/**
 * Desktop Use permission grant: open System Settings + drag-to-list overlay,
 * then restart only the host when the grant rising edge is observed.
 *
 * Never uses system TCC prompt APIs. The running Atmos.app process is not
 * restarted.
 */

import { mainLog } from "../main-log.js";
import {
  desktopUseDoctor,
  desktopUseDriverRestart,
  desktopUseGrantPermissions,
  desktopUseStatus,
} from "./client.js";
import {
  showAccessibilityGrantOverlay,
  closeAccessibilityGrantOverlay,
  type GrantOverlayPurpose,
} from "./grant-overlay.js";

export type DesktopUseGrantTarget =
  | "accessibility"
  | "screen_recording"
  | "all";

let lastFlowAt = 0;
let lastFlowTarget = "";
const FLOW_DEBOUNCE_MS = 10_000;

let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchStartedAt = 0;
let watchTarget: GrantOverlayPurpose | null = null;

function stopGrantWatch(): void {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
  watchTarget = null;
}

async function tickGrantWatch(timeoutMs: number): Promise<void> {
  const target = watchTarget;
  if (!target) return;
  if (Date.now() - watchStartedAt > timeoutMs) {
    stopGrantWatch();
    return;
  }
  try {
    const doctor = (await desktopUseDoctor()) as {
      accessibility?: boolean | null;
      screen_recording?: boolean | null;
    };
    const granted =
      target === "accessibility"
        ? doctor.accessibility === true
        : doctor.screen_recording === true;
    if (!granted) return;
    stopGrantWatch();
    try {
      closeAccessibilityGrantOverlay();
    } catch {
      /* overlay optional */
    }
    mainLog(
      `[desktop-use-grant] ${target} granted — restarting Desktop Use host`,
    );
    await desktopUseDriverRestart();
  } catch (error) {
    mainLog(
      `[desktop-use-grant] watch failed: ${error instanceof Error ? error.message : String(error)}`,
      "warn",
    );
  }
}

/** Poll doctor until the requested grant appears, then restart the host once. */
export function startDesktopUseGrantWatch(
  target: GrantOverlayPurpose,
  timeoutMs = 120_000,
): void {
  watchTarget = target;
  watchStartedAt = Date.now();
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    void tickGrantWatch(timeoutMs);
  }, 2000);
  void tickGrantWatch(timeoutMs);
}

export function stopDesktopUseGrantWatchForTest(): void {
  stopGrantWatch();
  lastFlowAt = 0;
  lastFlowTarget = "";
}

/**
 * Open the matching Privacy pane, fly the drag-to-list overlay, and restart
 * Desktop Use when the grant is detected.
 */
export async function openDesktopUseGrantFlow(opts: {
  target: DesktopUseGrantTarget;
  locale?: string;
  sourceOrigin?: { x: number; y: number };
}): Promise<{
  ok: boolean;
  host_app_path?: string | null;
  host_app_name?: string | null;
  drag_overlay?: { ok: boolean; error?: string };
  [key: string]: unknown;
}> {
  const purpose: GrantOverlayPurpose =
    opts.target === "screen_recording" ? "screen_recording" : "accessibility";
  const flowKey = opts.target;
  const now = Date.now();
  if (lastFlowTarget === flowKey && now - lastFlowAt < FLOW_DEBOUNCE_MS) {
    startDesktopUseGrantWatch(purpose);
    return { ok: true };
  }
  lastFlowAt = now;
  lastFlowTarget = flowKey;

  const cliTarget =
    opts.target === "accessibility" ||
    opts.target === "screen_recording" ||
    opts.target === "all"
      ? opts.target
      : "all";
  const result = (await desktopUseGrantPermissions(cliTarget)) as {
    ok?: boolean;
    host_app_path?: string | null;
    host_app_name?: string | null;
    [key: string]: unknown;
  };

  let hostPath =
    typeof result.host_app_path === "string" ? result.host_app_path : "";
  let hostName =
    typeof result.host_app_name === "string" ? result.host_app_name : undefined;
  if (!hostPath) {
    try {
      const st = await desktopUseStatus();
      if (typeof st?.host_app_path === "string") hostPath = st.host_app_path;
      if (!hostName && typeof st?.host_app_name === "string") {
        hostName = st.host_app_name;
      }
    } catch {
      /* overlay reports missing path */
    }
  }

  let drag_overlay: { ok: boolean; error?: string } | undefined;
  if (hostPath) {
    drag_overlay = showAccessibilityGrantOverlay({
      hostAppPath: hostPath,
      hostAppName: hostName,
      locale: opts.locale,
      purpose,
      sourceOrigin: opts.sourceOrigin,
    });
  } else {
    drag_overlay = {
      ok: false,
      error: "Host app path missing; install the control engine first",
    };
  }

  startDesktopUseGrantWatch(purpose);
  return {
    ...result,
    ok: result.ok !== false && drag_overlay.ok,
    host_app_path: hostPath || result.host_app_path || null,
    host_app_name: hostName ?? result.host_app_name ?? null,
    drag_overlay,
  };
}
