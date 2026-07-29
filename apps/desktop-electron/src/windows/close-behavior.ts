/**
 * Window close-button policy for the main shell (Tauri parity).
 *
 * Red-button / window close hides (macOS) or minimizes (other) the main window
 * so the process stays alive and Dock/taskbar restore does not full-reload UI.
 * Real quit (Cmd+Q / menu / app.quit) sets allowCloseToDestroy and tears down.
 */

import type { BrowserWindow } from "electron";
import { ensureMacDockVisible } from "./mac-dock.js";

/** Set true before intentional quit so close handlers allow destroy. */
let allowCloseToDestroy = false;

export function markAllowWindowDestroy(): void {
  allowCloseToDestroy = true;
}

export function isAllowWindowDestroy(): boolean {
  return allowCloseToDestroy;
}

function keepAppRunning(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
  }
  // macOS: hide leaves the app in the Dock (same as Tauri desktop).
  // Other platforms: minimize keeps a taskbar affordance (no tray yet).
  if (process.platform === "darwin") {
    win.hide();
    // If AppShot overlay dismissed the Dock icon earlier, re-show so the
    // user can restore from Dock after red-button hide.
    void ensureMacDockVisible();
  } else {
    win.minimize();
  }
}

/**
 * Wire main-window close: always keep running (hide/minimize), never prompt.
 * Call once per main BrowserWindow.
 */
export function wireMainWindowCloseBehavior(win: BrowserWindow): void {
  win.on("close", (event) => {
    if (allowCloseToDestroy || win.isDestroyed()) {
      return;
    }
    event.preventDefault();
    keepAppRunning(win);
  });
}
