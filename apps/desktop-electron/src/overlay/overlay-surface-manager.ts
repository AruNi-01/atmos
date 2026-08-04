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
import {
  OVERLAY_CREATE_BUDGET_MS,
  OVERLAY_IDLE_MS,
  OVERLAY_WINDOW_NAME_PREFIX,
} from "./constants.js";
import { OverlayLifecycleController } from "./overlay-lifecycle.js";

export type OverlayPointerMode = "pass-through" | "capture";

type HostOverlay = {
  host: BrowserWindow;
  overlay: BrowserWindow | null;
  lifecycle: OverlayLifecycleController;
  pointerMode: OverlayPointerMode;
  /** Bound once per host entry so recreate cycles do not leak listeners. */
  syncBounds: () => void;
};

/** Structural subset shared by HandlerDetails and DidCreateWindowDetails. */
type OverlayFrameDetails = Pick<HandlerDetails, "url"> & {
  frameName?: string;
};

function isOverlayFrame(details: OverlayFrameDetails): boolean {
  const name = details.frameName ?? "";
  if (name.startsWith(OVERLAY_WINDOW_NAME_PREFIX) || name === "atmos-desktop-overlay") {
    return true;
  }
  // about:blank from product host for portal bootstrap
  if (details.url === "about:blank" && name.includes("overlay")) return true;
  return false;
}

function overlayWindowOptions(
  host: BrowserWindow,
): BrowserWindowConstructorOptions {
  return {
    parent: host,
    ...host.getContentBounds(),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    focusable: true,
  };
}

export function overlayWindowOpenHandler(
  host: BrowserWindow,
  manager: OverlaySurfaceManager,
): (details: HandlerDetails) => Electron.WindowOpenHandlerResponse {
  return (details) => {
    if (!isOverlayFrame(details)) {
      // Default: allow normal popups (rare); product mostly blocks elsewhere.
      return { action: "allow" };
    }

    return {
      action: "allow",
      // webPreferences apply to the child webContents which is created
      // before createWindow runs — they must be returned here.
      overrideBrowserWindowOptions: {
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      },
      // Per-pixel transparency only works when the window is constructed
      // transparent. Renderer-initiated windows (window.open +
      // overrideBrowserWindowOptions) do not reliably honor `transparent`
      // (electron#22281 — paints opaque black), so main constructs the
      // BrowserWindow itself. `options` carries the child webContents that
      // keeps the opener's window.open proxy wired for createPortal.
      createWindow: (options) => {
        const overlay = new BrowserWindow({
          ...options,
          ...overlayWindowOptions(host),
        });
        manager.registerOverlayWindow(host, overlay);
        return overlay.webContents;
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
      // Safety net; createWindow already registered main-constructed overlays.
      if (isOverlayFrame(details)) {
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
      syncBounds: () => {},
    };

    entryRef.syncBounds = () => this.syncBounds(entryRef);
    // Once per host — overlay recreate cycles must not re-add listeners.
    host.on("resize", entryRef.syncBounds);
    host.on("move", entryRef.syncBounds);

    entryRef.lifecycle = new OverlayLifecycleController({
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (t) => clearTimeout(t),
      idleMs: OVERLAY_IDLE_MS,
      create: async () => {
        // Overlay must be opened by the host renderer via window.open so the
        // web side can install a createPortal root. Wait briefly for
        // did-create-window registration; if none arrives, fail so lifecycle
        // stays retryable and elevation falls back to APP-029 hide.
        const deadline = Date.now() + OVERLAY_CREATE_BUDGET_MS;
        while (
          (!entryRef.overlay || entryRef.overlay.isDestroyed()) &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 16));
        }
        if (!entryRef.overlay || entryRef.overlay.isDestroyed()) {
          throw new Error(
            "overlay window not registered by host window.open within create budget",
          );
        }
      },
      destroy: () => {
        this.destroyOverlayWindow(entryRef);
      },
    });

    this.byHostId.set(id, entryRef);
    return entryRef;
  }

  registerOverlayWindow(host: BrowserWindow, child: BrowserWindow): void {
    const entry = this.getOrCreateEntry(host);
    if (entry.overlay === child) return;
    if (entry.overlay && !entry.overlay.isDestroyed()) {
      try {
        entry.overlay.close();
      } catch {
        /* ignore */
      }
    }
    entry.overlay = child;
    this.syncBounds(entry);
    // Start non-interactive + hidden until noteActivity.
    try {
      child.setIgnoreMouseEvents(true, { forward: true });
      if (child.isVisible()) child.hide();
    } catch {
      /* ignore */
    }

    child.on("closed", () => {
      if (entry.overlay === child) entry.overlay = null;
    });

    this.emitToHost(host, "desktop-overlay:ready", {
      windowId: child.id,
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
        if (win.isFocused() && !entry.host.isDestroyed()) entry.host.focus();
      } catch {
        /* ignore */
      }
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
      // Pass-through (tooltip/hover-card only): clicks reach host + preview.
      // Capture (menu/popover/dialog): overlay owns pointer input.
      if (entry.pointerMode === "pass-through") {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    } catch {
      /* ignore */
    }
  }

  /** Keyboard (Escape, menu nav, dialog inputs) must reach the overlay document. */
  private focusOverlayForCapture(entry: HostOverlay): void {
    const win = entry.overlay;
    if (!win || win.isDestroyed()) return;
    if (entry.pointerMode !== "capture") return;
    try {
      if (win.isVisible() && !win.isFocused()) win.focus();
    } catch {
      /* ignore */
    }
  }

  /** Return keyboard focus to the host when the overlay gives up input. */
  private refocusHost(entry: HostOverlay): void {
    const { host, overlay } = entry;
    if (!overlay || overlay.isDestroyed() || host.isDestroyed()) return;
    try {
      if (overlay.isFocused()) host.focus();
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
    const changed = entry.pointerMode !== mode;
    entry.pointerMode = mode;
    this.applyPointerMode(entry);
    if (changed && mode === "capture") {
      this.focusOverlayForCapture(entry);
    } else if (changed && mode === "pass-through") {
      this.refocusHost(entry);
    }
  }

  noteActivity(host: BrowserWindow | null): void {
    const h = host ?? this.state.mainWindow;
    if (!h || h.isDestroyed()) return;
    const entry = this.byHostId.get(this.hostKey(h));
    if (!entry) return;
    entry.lifecycle.noteActivity();
    // Layers open: surface must be visible; pointer mode is owned by the host
    // renderer via set_pointer_mode (do not force capture here).
    const win = entry.overlay;
    if (win && !win.isDestroyed()) {
      try {
        this.syncBounds(entry);
        this.applyPointerMode(entry);
        if (!win.isVisible()) {
          // showInactive: never steal keyboard focus for pass-through layers.
          win.showInactive();
          this.focusOverlayForCapture(entry);
        }
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
    entry.pointerMode = "pass-through";
    // Empty overlay must not block host/preview input or hold keyboard focus.
    this.refocusHost(entry);
    const win = entry.overlay;
    if (win && !win.isDestroyed()) {
      try {
        win.setIgnoreMouseEvents(true, { forward: true });
        if (win.isVisible()) win.hide();
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
    try {
      if (!host.isDestroyed()) {
        host.removeListener("resize", entry.syncBounds);
        host.removeListener("move", entry.syncBounds);
      }
    } catch {
      /* ignore */
    }
    this.byHostId.delete(id);
  }

  destroyAll(): void {
    for (const entry of this.byHostId.values()) {
      entry.lifecycle.forceDestroy();
      try {
        if (!entry.host.isDestroyed()) {
          entry.host.removeListener("resize", entry.syncBounds);
          entry.host.removeListener("move", entry.syncBounds);
        }
      } catch {
        /* ignore */
      }
    }
    this.byHostId.clear();
  }

  surfaceCount(): number {
    return [...this.byHostId.values()].filter(
      (e) => e.overlay && !e.overlay.isDestroyed(),
    ).length;
  }
}
