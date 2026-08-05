/**
 * macOS Dock visibility helpers.
 *
 * Electron / macOS can leave a **zero-width Dock tile** (Accessibility still
 * lists the app, but size is 0×N so the icon looks missing or tiny) when the
 * shell:
 * - creates a `type: "panel"` BrowserWindow, and/or
 * - calls `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`,
 * - or on recent Electron 37 + macOS 26, after various always-on-top / boot paths
 *
 * See: https://github.com/electron/electron/issues/26350
 *
 * Call {@link ensureMacDockVisible} after such APIs, and on activate /
 * hide-to-background paths so the user always has a Dock restore affordance.
 *
 * Soft `dock.show()` alone often does **not** repair a 0-width tile — the hard
 * hide→show recycle does. Soft is still used on high-frequency paths (activate).
 * Boot uses {@link pinMacDockAfterBoot} (hard + delayed retries).
 *
 * Packaged builds: rely on CFBundleIconFile / Assets.car. Runtime
 * `dock.setIcon` has been observed to zero the tile on some Electron 37 builds,
 * so setIcon is **dev-only**.
 */

/** Debounce concurrent soft restores. */
let softRestoreInFlight: Promise<void> | null = null;
/** Debounce hard hide→show recycles (avoid dock blink storms). */
let hardRestoreInFlight: Promise<void> | null = null;
let softFollowUpTimer: ReturnType<typeof setTimeout> | null = null;
let bootPinScheduled = false;

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
 * Boot / first-paint pin: soft once, then hard recycle + delayed hard retries.
 * Soft-only was leaving Atmos at Accessibility size 0×N on macOS 26 (Tahoe)
 * while Finder/DMG still showed the full Assets.car / icns icon.
 *
 * Safe to call multiple times; only the first call schedules the retry chain.
 */
export async function pinMacDockAfterBoot(): Promise<void> {
  if (process.platform !== "darwin") return;
  await ensureMacDockVisible();
  await forceMacDockTileRefresh();

  if (bootPinScheduled) return;
  bootPinScheduled = true;
  // Staggered hard pins — boot races (webview, appshot arm, second-instance)
  // can re-collapse the tile after the first recycle.
  for (const ms of [200, 600, 1500]) {
    setTimeout(() => {
      void forceMacDockTileRefresh();
    }, ms);
  }
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
      await sleep(50);
    }

    const showResult = app.dock.show();
    if (showResult && typeof (showResult as Promise<void>).then === "function") {
      await showResult;
    }

    // Dev only: stock Electron.app needs a runtime icon. Packaged Atmos.app
    // already has CFBundleIconFile / Assets.car — setIcon there has been
    // observed to zero-out the tile on some Electron 37 builds.
    if (!app.isPackaged) {
      try {
        const { nativeImage } = await import("electron");
        const { getResolvedAppIcons } = await import("../branding.js");
        const icons = getResolvedAppIcons();
        // Prefer PNG for setIcon — .icns via nativeImage is flaky on some builds.
        const path = icons.pngPath ?? icons.dockIconPath;
        if (path) {
          let image = nativeImage.createFromPath(path);
          if (!image.isEmpty()) {
            const size = image.getSize();
            if (size.width >= 512 && size.height >= 512) {
              image = image.resize({ width: 512, height: 512, quality: "best" });
            }
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
