/**
 * macOS Dock visibility helpers.
 *
 * Electron / macOS can leave a **zero-width Dock tile** (Accessibility still
 * lists the app, but size is 0×N so the icon is invisible) when the shell:
 * - creates a `type: "panel"` BrowserWindow, and/or
 * - calls `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
 *
 * See: https://github.com/electron/electron/issues/26350
 *
 * Call {@link ensureMacDockVisible} after any such API, and on activate /
 * hide-to-background paths so the user always has a Dock restore affordance.
 *
 * Packaged builds must rely on `CFBundleIconFile` — runtime `dock.setIcon`
 * has been observed to contribute to a broken / zero-size tile on Electron 37.
 */

/** Debounce concurrent soft restores. */
let softRestoreInFlight: Promise<void> | null = null;
/** Debounce hard hide→show recycles (avoid dock blink storms). */
let hardRestoreInFlight: Promise<void> | null = null;
let softFollowUpTimer: ReturnType<typeof setTimeout> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Soft re-show: activation policy + dock.show(). Safe to call often (activate,
 * ready-to-show, second-instance). Does not hide the Dock first.
 */
export async function ensureMacDockVisible(): Promise<void> {
  if (process.platform !== "darwin") return;
  if (softRestoreInFlight) {
    await softRestoreInFlight;
    return;
  }

  softRestoreInFlight = restoreMacDockOnce(false).finally(() => {
    softRestoreInFlight = null;
  });
  await softRestoreInFlight;

  // One delayed soft pin for racey boot paths (no hide→show — that blinks).
  if (softFollowUpTimer) {
    clearTimeout(softFollowUpTimer);
  }
  softFollowUpTimer = setTimeout(() => {
    softFollowUpTimer = null;
    void restoreMacDockOnce(false);
  }, 300);
}

/**
 * Hard recycle: dock.hide() → dock.show(). Use after APIs known to leave a
 * zero-width ghost tile (all-workspaces, legacy panel overlay). Avoid calling
 * from high-frequency paths (activate / every window event).
 */
export async function forceMacDockTileRefresh(): Promise<void> {
  if (process.platform !== "darwin") return;
  if (hardRestoreInFlight) {
    await hardRestoreInFlight;
    return;
  }
  hardRestoreInFlight = restoreMacDockOnce(true).finally(() => {
    hardRestoreInFlight = null;
  });
  await hardRestoreInFlight;
}

/**
 * @param hard — when true, hide→show to force Dock to recreate the tile
 *   (needed after panel / all-workspaces left a 0-width ghost entry).
 */
async function restoreMacDockOnce(hard: boolean): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    const { app } = await import("electron");
    if (!app.dock) return;

    // Panel / all-workspaces can flip the app to accessory (no real Dock tile).
    try {
      app.setActivationPolicy?.("regular");
    } catch {
      /* older Electron / non-mac */
    }

    if (hard) {
      // Recycle the Dock tile. isVisible() often still reports true while the
      // Accessibility size is 0×N (invisible). Always hide→show on hard path.
      try {
        app.dock.hide();
      } catch {
        /* ignore */
      }
      await sleep(40);
    }

    const showResult = app.dock.show();
    if (showResult && typeof (showResult as Promise<void>).then === "function") {
      await showResult;
    }

    // Dev only: stock Electron.app needs a runtime icon. Packaged Atmos.app
    // already has CFBundleIconFile — setIcon there can zero-out the tile.
    if (!app.isPackaged) {
      try {
        const { nativeImage } = await import("electron");
        const { getResolvedAppIcons } = await import("../branding.js");
        const icons = getResolvedAppIcons();
        // Prefer PNG for setIcon — .icns via nativeImage is flaky on some builds.
        const path = icons.pngPath ?? icons.dockIconPath;
        if (path) {
          const image = nativeImage.createFromPath(path);
          if (!image.isEmpty()) {
            app.dock.setIcon(image);
          }
        }
      } catch {
        /* branding may not resolve in unit tests */
      }
    }
  } catch {
    /* ignore — main process only; tests may lack electron */
  }
}

/**
 * Apply workspace visibility for always-on-top overlays, then restore Dock.
 *
 * Prefer enabling this only while the overlay is actually shown (capture play),
 * never when pre-creating a hidden warm window at boot.
 * After disable, force a hard Dock tile recycle.
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
  } else {
    await forceMacDockTileRefresh();
  }
}
