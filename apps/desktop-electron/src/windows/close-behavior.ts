/**
 * Window close-button policy for the main shell.
 *
 * Default Electron destroys the window → dock click recreates it (full reload).
 * We intercept close, optionally ask the user, and either hide/minimize (keep
 * process + UI state) or quit for real.
 */

import { app, dialog, type BrowserWindow } from "electron";
import {
  closeDialogCopy,
  readCloseAction,
  writeCloseAction,
  type CloseAction,
} from "../prefs/close-behavior.js";

/** Set true before intentional quit so close handlers do not re-prompt. */
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
  } else {
    win.minimize();
  }
}

async function promptCloseAction(win: BrowserWindow): Promise<"hide" | "quit" | "cancel"> {
  const copy = closeDialogCopy(app.getLocale());
  const result = await dialog.showMessageBox(win, {
    type: "question",
    buttons: [copy.keepRunning, copy.quit, copy.cancel],
    defaultId: 0,
    cancelId: 2,
    title: copy.title,
    message: copy.message,
    detail: copy.detail,
    checkboxLabel: copy.dontAsk,
    checkboxChecked: false,
    noLink: true,
  });

  if (result.response === 2) return "cancel";
  const action: "hide" | "quit" = result.response === 1 ? "quit" : "hide";
  if (result.checkboxChecked) {
    writeCloseAction(action);
  }
  return action;
}

/**
 * Wire main-window close so red-button does not always destroy + force reload.
 * Call once per main BrowserWindow.
 */
export function wireMainWindowCloseBehavior(win: BrowserWindow): void {
  win.on("close", (event) => {
    if (allowCloseToDestroy || win.isDestroyed()) {
      return;
    }

    // Always intercept; resolve preference (sync or dialog) then hide or quit.
    event.preventDefault();

    void (async () => {
      let action: CloseAction | "cancel" = readCloseAction();
      if (action === "ask") {
        if (win.isDestroyed()) return;
        action = await promptCloseAction(win);
      }

      if (action === "cancel" || action === "ask") {
        return;
      }

      if (action === "hide") {
        keepAppRunning(win);
        return;
      }

      // quit
      markAllowWindowDestroy();
      app.quit();
    })();
  });
}
