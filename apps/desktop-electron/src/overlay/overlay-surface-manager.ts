/**
 * Per-host singleton overlay BrowserWindow for APP-052.
 * Lazy create + idle destroy. Stacks above WebContentsView previews via parented window.
 *
 * Host renderer opens about:blank (same-origin) via window.open for createPortal access;
 * main process intercepts and applies transparent parented window options, then tracks
 * lifecycle / idle destroy here.
 */

import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type HandlerDetails,
} from "electron";
import type { AppState } from "../app-state.js";
import { OVERLAY_IDLE_MS, OVERLAY_WINDOW_NAME_PREFIX } from "./constants.js";
import { OverlayLifecycleController } from "./overlay-lifecycle.js";

export type OverlayPointerMode = "pass-through" | "capture";

type HostOverlay = {
  host: BrowserWindow;
  overlay: BrowserWindow | null;
  lifecycle: OverlayLifecycleController;
  pointerMode: OverlayPointerMode;
};

function isOverlayFrame(details: HandlerDetails): boolean {
  const name = details.frameName ?? "";
  if (name.startsWith(OVERLAY_WINDOW_NAME_PREFIX) || name === "atmos-desktop-overlay") {
    return true;
  }
  // about:blank from product host for portal bootstrap
  if (details.url === "about:blank" && name.includes("overlay")) return true;
  return false;
}

export function overlayWindowOpenHandler(
  host: BrowserWindow,
  manager: OverlaySurfaceManager,
): (details: HandlerDetails) =>
  | { action: "deny" }
  | {
      action: "allow";
      overrideBrowserWindowOptions?: BrowserWindowConstructorOptions;
    } {
  return (details) => {
    if (!isOverlayFrame(details) && details.frameName !== "atmos-desktop-overlay") {
      // Default: allow normal popups (rare); product mostly blocks elsewhere.
      return { action: "allow" };
    }

    const bounds = host.getContentBounds();
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        parent: host,
        ...bounds,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        focusable: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  };
}

export class OverlaySurfaceManager {
  private readonly byHostId = new Map<number, HostOverlay>();

  constructor(private readonly state: AppState) {}

  private hostKey(host: BrowserWindow): number {
    return host.id;
  }

  /** Wire window.open intercept on a product host window. */
  attachHost(host: BrowserWindow): void {
    host.webContents.setWindowOpenHandler(
      overlayWindowOpenHandler(host, this),
    );

    host.webContents.on("did-create-window", (child, details) => {
      if (
        details.frameName === "atmos-desktop-overlay" ||
        (details.frameName ?? "").startsWith(OVERLAY_WINDOW_NAME_PREFIX)
      ) {
        this.registerOverlayWindow(host, child);
      }
    });

    host.once("closed", () => {
      this.destroyForHost(host);
    });
  }

  private getOrCreateEntry(host: BrowserWindow): HostOverlay {
    const id = this.hostKey(host);
    let entry = this.byHostId.get(id);
    if (entry) return entry;

    const entryRef: HostOverlay = {
      host,
      overlay: null,
      pointerMode: "pass-through",
      lifecycle: null as unknown as OverlayLifecycleController,
    };

    entryRef.lifecycle = new OverlayLifecycleController({
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (t) => clearTimeout(t),
      idleMs: OVERLAY_IDLE_MS,
      create: async () => {
        // Prefer host window.open registration. If host already opened the
        // portal window, did-create-window registered it. Otherwise wait briefly
        // for registration; only then fall back to main-owned window.
        const deadline = Date.now() + 400;
        while (
          (!entryRef.overlay || entryRef.overlay.isDestroyed()) &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 16));
        }
        if (!entryRef.overlay || entryRef.overlay.isDestroyed()) {
          await this.createFallbackOverlay(entryRef);
        }
      },
      destroy: () => {
        this.destroyOverlayWindow(entryRef);
      },
    });

    this.byHostId.set(id, entryRef);
    return entryRef;
  }

  private registerOverlayWindow(host: BrowserWindow, child: BrowserWindow): void {
    const entry = this.getOrCreateEntry(host);
    if (entry.overlay && !entry.overlay.isDestroyed() && entry.overlay !== child) {
      try {
        entry.overlay.close();
      } catch {
        /* ignore */
      }
    }
    entry.overlay = child;
    this.syncBounds(entry);
    this.applyPointerMode(entry);

    const syncBounds = () => this.syncBounds(entry);
    host.on("resize", syncBounds);
    host.on("move", syncBounds);

    child.on("closed", () => {
      if (entry.overlay === child) entry.overlay = null;
    });

    this.emitToHost(host, "desktop-overlay:ready", {
      windowId: child.id,
      hostId: host.id,
    });
  }

  private async createFallbackOverlay(entry: HostOverlay): Promise<void> {
    if (entry.overlay && !entry.overlay.isDestroyed()) return;
    const host = entry.host;
    if (host.isDestroyed()) throw new Error("host window destroyed");

    const bounds = host.getContentBounds();
    const win = new BrowserWindow({
      parent: host,
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      focusable: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    entry.overlay = win;
    await win.loadURL("about:blank");
    this.syncBounds(entry);
    // Stay hidden until noteActivity (portal has real layers) — R4.
    try {
      win.setIgnoreMouseEvents(true, { forward: true });
      if (win.isVisible()) win.hide();
    } catch {
      /* ignore */
    }
    this.emitToHost(host, "desktop-overlay:ready", {
      windowId: win.id,
      hostId: host.id,
    });
  }

  private syncBounds(entry: HostOverlay): void {
    const { host, overlay } = entry;
    if (!overlay || overlay.isDestroyed() || host.isDestroyed()) return;
    try {
      overlay.setBounds(host.getContentBounds());
    } catch {
      /* ignore */
    }
  }

  private destroyOverlayWindow(entry: HostOverlay): void {
    const win = entry.overlay;
    entry.overlay = null;
    if (win && !win.isDestroyed()) {
      const hostId = entry.host.isDestroyed() ? null : entry.host.id;
      try {
        win.close();
      } catch {
        /* ignore */
      }
      if (hostId != null && !entry.host.isDestroyed()) {
        this.emitToHost(entry.host, "desktop-overlay:destroyed", {
          windowId: win.id,
          hostId,
        });
      }
    }
  }

  private emitToHost(
    host: BrowserWindow,
    channel: string,
    payload: unknown,
  ): void {
    try {
      if (!host.isDestroyed()) {
        host.webContents.send(`atmos:desktop-event:${channel}`, payload);
      }
    } catch {
      /* ignore */
    }
  }

  private applyPointerMode(entry: HostOverlay): void {
    const win = entry.overlay;
    if (!win || win.isDestroyed()) return;
    try {
      // v1: always receive mouse events so elevated menus/dialogs are clickable.
      // setIgnoreMouseEvents(true) makes the whole window unclickable; CSS cannot override.
      void entry.pointerMode;
      win.setIgnoreMouseEvents(false);
    } catch {
      /* ignore */
    }
  }

  async ensure(host: BrowserWindow | null): Promise<{
    ok: boolean;
    ready: boolean;
    windowId?: number;
  }> {
    const h = host ?? this.state.mainWindow;
    if (!h || h.isDestroyed()) {
      return { ok: false, ready: false };
    }
    const entry = this.getOrCreateEntry(h);
    try {
      // Ensure only prepares the surface; do not show/capture here (B5).
      // Host calls note_activity when portal has real layers.
      const { ready } = await entry.lifecycle.ensure();
      const windowId =
        entry.overlay && !entry.overlay.isDestroyed()
          ? entry.overlay.id
          : undefined;
      return { ok: true, ready, windowId };
    } catch (err) {
      console.error("[overlay] ensure failed", err);
      return { ok: false, ready: false };
    }
  }

  setPointerMode(host: BrowserWindow | null, mode: OverlayPointerMode): void {
    const h = host ?? this.state.mainWindow;
    if (!h || h.isDestroyed()) return;
    const entry = this.byHostId.get(this.hostKey(h));
    if (!entry) return;
    entry.pointerMode = mode;
    this.applyPointerMode(entry);
  }

  noteActivity(host: BrowserWindow | null): void {
    const h = host ?? this.state.mainWindow;
    if (!h || h.isDestroyed()) return;
    const entry = this.byHostId.get(this.hostKey(h));
    if (!entry) return;
    entry.lifecycle.noteActivity();
    // Layers open: surface must be visible and receive input.
    const win = entry.overlay;
    if (win && !win.isDestroyed()) {
      try {
        if (!win.isVisible()) win.showInactive();
        win.setIgnoreMouseEvents(false);
      } catch {
        /* ignore */
      }
    }
  }

  release(host: BrowserWindow | null): void {
    const h = host ?? this.state.mainWindow;
    if (!h || h.isDestroyed()) return;
    const entry = this.byHostId.get(this.hostKey(h));
    if (!entry) return;
    entry.lifecycle.release();
    // R1: empty overlay must not block host/preview input during idle window.
    const win = entry.overlay;
    if (win && !win.isDestroyed()) {
      try {
        win.setIgnoreMouseEvents(true, { forward: true });
        win.hide();
      } catch {
        /* ignore */
      }
    }
  }

  destroyForHost(host: BrowserWindow): void {
    const id = this.hostKey(host);
    const entry = this.byHostId.get(id);
    if (!entry) return;
    entry.lifecycle.forceDestroy();
    this.byHostId.delete(id);
  }

  destroyAll(): void {
    for (const entry of this.byHostId.values()) {
      entry.lifecycle.forceDestroy();
    }
    this.byHostId.clear();
  }

  surfaceCount(): number {
    return [...this.byHostId.values()].filter(
      (e) => e.overlay && !e.overlay.isDestroyed(),
    ).length;
  }
}
