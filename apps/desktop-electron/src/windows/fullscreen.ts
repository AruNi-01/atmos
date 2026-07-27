import type { BrowserWindow } from "electron";

const FULLSCREEN_EVENT = "window-fullscreen-changed";

/**
 * Emit enter/leave-full-screen to the window's renderer so web can toggle
 * traffic-light padding (pl-[92px] ↔ pl-4).
 */
export function wireFullscreenEvents(win: BrowserWindow): void {
  const emit = () => {
    if (win.isDestroyed()) return;
    const fullscreen = win.isFullScreen();
    win.webContents.send(`atmos:desktop-event:${FULLSCREEN_EVENT}`, {
      fullscreen,
    });
  };

  win.on("enter-full-screen", emit);
  win.on("leave-full-screen", emit);
  // Some macOS transitions only fire resize; keep in sync.
  win.on("resize", () => {
    // Debounce not needed — cheap boolean read.
    emit();
  });
}

export { FULLSCREEN_EVENT };
