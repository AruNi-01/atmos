/**
 * macOS Dock visibility helpers.
 *
 * Electron can dismiss the Dock icon when a BrowserWindow calls
 * `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
 * (often used for AppShot capture overlays). See:
 * https://github.com/electron/electron/issues/26350
 *
 * Call {@link ensureMacDockVisible} after any such API, and on activate /
 * hide-to-background paths so the user always has a Dock restore affordance.
 */

/** Re-show the Dock icon if Electron/macOS hid it. No-op off darwin. */
export async function ensureMacDockVisible(): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    const { app } = await import("electron");
    // Force show even when isVisible() reports true — after
    // setVisibleOnAllWorkspaces the icon can still be missing (electron#26350).
    app.dock?.show();
  } catch {
    /* ignore — main process only; tests may lack electron */
  }
}

/**
 * Apply workspace visibility for always-on-top overlays, then restore Dock.
 * Order matters: setVisibleOnAllWorkspaces → dock.show (electron#26350).
 */
export async function setOverlayVisibleOnAllWorkspaces(
  win: {
    setVisibleOnAllWorkspaces: (
      v: boolean,
      opts?: { visibleOnFullScreen?: boolean },
    ) => void;
  },
  visible: boolean,
): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    win.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: visible });
  } catch {
    /* older Electron */
  }
  if (visible) {
    await ensureMacDockVisible();
  }
}
