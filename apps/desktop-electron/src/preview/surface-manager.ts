/**
 * Desktop-native preview surfaces via Electron WebContentsView + partition.
 * Command names match Tauri preview_bridge_*.
 */

import {
  BrowserWindow,
  WebContentsView,
  session,
  type Session,
} from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppState } from "../app-state.js";
import { appWindowBranding } from "../branding.js";
import type { PreviewBounds } from "../types.js";
import { gateAndRemapRuntimeEvent } from "./runtime-events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_PARTITION = "persist:atmos-preview";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "packages/shared/preview/preview-runtime.js"))) {
      return dir;
    }
    if (existsSync(join(dir, "apps/desktop/src-tauri"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "../../..");
}
const REPO_ROOT = findRepoRoot(__dirname);

type SurfaceState = {
  sessionId: string;
  bridgeToken: string;
  currentUrl: string;
  detached: boolean;
  visible: boolean;
  pickMode: boolean;
  bounds: Required<PreviewBounds> | null;
  view: WebContentsView | null;
  detachedWindow: BrowserWindow | null;
};

function previewRuntimeScriptPath(): string {
  const p = join(REPO_ROOT, "packages/shared/preview/preview-runtime.js");
  return p;
}

function buildBridgeInjection(bridgeToken: string): string {
  const runtimePath = previewRuntimeScriptPath();
  const runtime = existsSync(runtimePath)
    ? readFileSync(runtimePath, "utf8")
    : "/* preview-runtime.js missing */";
  if (!existsSync(runtimePath)) {
    console.error(`[preview] runtime script missing: ${runtimePath}`);
  }
  const tokenJson = JSON.stringify(bridgeToken);
  return `
${runtime}
(() => {
  if (window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__) return;
  const invoke = window.__ATMOS_PREVIEW_INVOKE__;
  if (!invoke) {
    console.error('[atmos-preview] __ATMOS_PREVIEW_INVOKE__ missing — preview preload failed');
    return;
  }
  if (!window.__ATMOS_PREVIEW_RUNTIME__) {
    console.error('[atmos-preview] __ATMOS_PREVIEW_RUNTIME__ missing — runtime inject failed');
    return;
  }
  const bridgeToken = ${tokenJson};
  const controller = window.__ATMOS_PREVIEW_RUNTIME__.createRuntime({
    win: window,
    showSelectionToolbar: true,
    emit(message) {
      invoke('preview_bridge_event', {
        payload: Object.assign({}, message, { bridgeToken })
      }).catch((err) => {
        console.error('[atmos-preview] emit failed', err);
      });
    },
  });
  window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__ = {
    announceReady(sessionId) { controller.announceReady(sessionId); },
    enterPickMode(sessionId) { controller.enterPickMode(sessionId); },
    clearSelection() { controller.exitPickMode(); },
    clearAnnotations() { controller.clearAnnotations?.(); },
    syncOverlays() { controller.syncOverlays?.(); },
    destroy() { controller.destroy(); },
  };
})();
`;
}

function surfaceLabel(sessionId: string): string {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `preview-${sanitized}`;
}

function previewPreloadPath(): string {
  // Built as CommonJS (.cjs) so sandboxed WebContentsView preloads can load.
  const candidates = [
    join(__dirname, "preview-preload.cjs"),
    join(__dirname, "preview-preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

function normalizeBounds(bounds: PreviewBounds): Required<PreviewBounds> {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
    zoom: Math.min(10, Math.max(0.2, bounds.zoom ?? 1)),
  };
}

export class PreviewSurfaceManager {
  private readonly surfaces = new Map<string, SurfaceState>();
  private readonly previewSession: Session;

  constructor(private readonly state: AppState) {
    this.previewSession = session.fromPartition(PREVIEW_PARTITION);
  }

  private hostWindow(): BrowserWindow {
    const w = this.state.mainWindow;
    if (!w || w.isDestroyed()) {
      throw new Error("preview host window not available: main");
    }
    return w;
  }

  private getOrCreateState(sessionId: string): SurfaceState {
    let s = this.surfaces.get(sessionId);
    if (!s) {
      s = {
        sessionId,
        bridgeToken: randomUUID(),
        currentUrl: "about:blank",
        detached: false,
        visible: false,
        pickMode: false,
        bounds: null,
        view: null,
        detachedWindow: null,
      };
      this.surfaces.set(sessionId, s);
    }
    return s;
  }

  private emitToApp(channel: string, payload: unknown) {
    const main = this.state.mainWindow;
    if (main && !main.isDestroyed()) {
      main.webContents.send(`atmos:desktop-event:${channel}`, payload);
    }
  }

  private emitLoadError(sessionId: string, url: string, err: unknown) {
    console.error(`[preview] loadURL failed session=${sessionId}`, err);
    this.emitToApp("desktop-preview:error", {
      type: "atmos-preview:error",
      sessionId,
      pageUrl: url,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  private destroyViewWebContents(view: WebContentsView) {
    try {
      if (!view.webContents.isDestroyed()) {
        // Prefer close(); fall back to destroy if present on older Electron types.
        const wc = view.webContents as Electron.WebContents & {
          destroy?: () => void;
        };
        if (typeof wc.close === "function") {
          wc.close();
        } else {
          wc.destroy?.();
        }
      }
    } catch {
      /* ignore */
    }
  }

  bridgeTokenFor(sessionId: string): string | null {
    return this.surfaces.get(sessionId)?.bridgeToken ?? null;
  }

  knownSessionIds(): Set<string> {
    return new Set(this.surfaces.keys());
  }

  private attachViewListeners(sessionId: string, view: WebContentsView) {
    this.attachWebContentsListeners(sessionId, view.webContents);
  }

  private attachWebContentsListeners(
    sessionId: string,
    wc: Electron.WebContents,
  ) {
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("did-finish-load", () => {
      const s = this.surfaces.get(sessionId);
      if (!s) return;
      const url = wc.getURL();
      s.currentUrl = url;
      void this.onPreviewPageFinished(
        wc,
        sessionId,
        url,
        s.bridgeToken,
        s.pickMode,
      );
    });
    wc.on("did-fail-load", (_e, code, desc, validatedURL) => {
      // -3 is ERR_ABORTED (navigation superseded); ignore noise.
      if (code === -3) return;
      console.error(
        `[preview] did-fail-load session=${sessionId} code=${code} ${desc} url=${validatedURL}`,
      );
      this.emitToApp("desktop-preview:error", {
        type: "atmos-preview:error",
        sessionId,
        pageUrl: validatedURL,
        error: desc || `load failed (${code})`,
      });
    });
    // Native Chromium title/favicon events — backup if MutationObserver is late
    // or the in-page runtime has not announced yet. Always send pageTitle as a
    // string: desktop-transport drops title-changed when pageTitle is not a string.
    wc.on("page-title-updated", (_e, title) => {
      const s = this.surfaces.get(sessionId);
      if (!s) return;
      const pageTitle = (title || "").trim();
      if (!pageTitle) return;
      this.emitToApp("desktop-preview:title-changed", {
        type: "atmos-preview:title-changed",
        sessionId,
        pageUrl: wc.getURL(),
        pageTitle,
      });
    });
    wc.on("page-favicon-updated", (_e, favicons) => {
      const s = this.surfaces.get(sessionId);
      if (!s) return;
      const faviconUrl =
        Array.isArray(favicons) && typeof favicons[0] === "string"
          ? favicons[0]
          : undefined;
      if (!faviconUrl) return;
      const pageTitle = (wc.getTitle() || "").trim();
      this.emitToApp("desktop-preview:title-changed", {
        type: "atmos-preview:title-changed",
        sessionId,
        pageUrl: wc.getURL(),
        // Omit empty title so product UI keeps a prior ready/title-changed value.
        ...(pageTitle ? { pageTitle } : {}),
        faviconUrl,
      });
    });
  }

  private async onPreviewPageFinished(
    wc: Electron.WebContents,
    sessionId: string,
    url: string,
    bridgeToken: string,
    pickMode: boolean,
  ): Promise<void> {
    this.emitToApp("desktop-preview:navigation-changed", {
      type: "atmos-preview:navigation-changed",
      sessionId,
      pageUrl: url,
      pageTitle: (wc.getTitle() || "").trim() || undefined,
    });
    // Tauri parity: re-inject runtime + announceReady/enterPickMode so the
    // product UI gets ready/title and element selection works.
    await this.injectAndSync(
      wc,
      sessionId,
      bridgeToken,
      pickMode ? "enterPickMode" : "announceReady",
    );
  }

  private async injectBridge(
    wc: Electron.WebContents,
    bridgeToken: string,
  ): Promise<boolean> {
    try {
      await wc.executeJavaScript(buildBridgeInjection(bridgeToken), true);
      const ok = await wc.executeJavaScript(
        `Boolean(window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__ && window.__ATMOS_PREVIEW_INVOKE__)`,
        true,
      );
      if (!ok) {
        console.error(
          "[preview] injectBridge: bridge missing after inject (preload invoke or runtime failed)",
        );
      }
      return Boolean(ok);
    } catch (e) {
      console.error("[preview] injectBridge failed", e);
      return false;
    }
  }

  private async syncSessionBridge(
    wc: Electron.WebContents,
    sessionId: string,
    method: "announceReady" | "enterPickMode" | "clearSelection",
  ): Promise<void> {
    const sessionJson = JSON.stringify(sessionId);
    const methodJson = JSON.stringify(method);
    const script = `
(() => {
  const sessionId = ${sessionJson};
  const method = ${methodJson};
  window.__ATMOS_PREVIEW_SESSION_ID__ = sessionId;
  let attempts = 0;
  const sync = () => {
    const bridge = window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__;
    if (bridge && typeof bridge[method] === 'function') {
      bridge[method](sessionId);
      return true;
    }
    attempts += 1;
    if (attempts < 40) {
      window.setTimeout(sync, 50);
      return false;
    }
    console.error('[atmos-preview] syncSessionBridge timed out method=' + method);
    return false;
  };
  return sync();
})();
`;
    try {
      await wc.executeJavaScript(script, true);
    } catch (e) {
      console.error("[preview] syncSessionBridge failed", e);
    }
  }

  /** Tauri-style: always re-inject bridge script then call the session method. */
  private async injectAndSync(
    wc: Electron.WebContents,
    sessionId: string,
    bridgeToken: string,
    method: "announceReady" | "enterPickMode" | "clearSelection",
  ): Promise<void> {
    await this.injectBridge(wc, bridgeToken);
    await this.syncSessionBridge(wc, sessionId, method);
  }

  private async evalPickMode(
    wc: Electron.WebContents,
    sessionId: string,
    pick: boolean,
    bridgeToken: string,
  ) {
    await this.injectAndSync(
      wc,
      sessionId,
      bridgeToken,
      pick ? "enterPickMode" : "clearSelection",
    );
  }

  private createView(sessionId: string, bridgeToken: string): WebContentsView {
    const preload = previewPreloadPath();
    if (!existsSync(preload)) {
      console.error(`[preview] preview preload missing: ${preload}`);
    }
    const view = new WebContentsView({
      webPreferences: {
        session: this.previewSession,
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        // Sandboxed + CJS preload: isolate untrusted page from Node while still
        // exposing the limited __ATMOS_PREVIEW_INVOKE__ bridge.
        sandbox: true,
      },
    });
    this.attachViewListeners(sessionId, view);
    view.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => {
        callback(false);
      },
    );
    void bridgeToken;
    return view;
  }

  open(
    sessionId: string,
    url: string,
    bounds: PreviewBounds,
  ): void {
    const s = this.getOrCreateState(sessionId);
    s.currentUrl = url;
    s.detached = false;
    s.visible = true;
    s.bounds = normalizeBounds(bounds);
    s.pickMode = false;

    if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      s.detachedWindow.close();
      s.detachedWindow = null;
    }

    const host = this.hostWindow();
    if (!s.view) {
      s.view = this.createView(sessionId, s.bridgeToken);
      host.contentView.addChildView(s.view);
    }
    // Ensure non-zero bounds (0×0 paints a blank surface over the panel).
    const b = s.bounds;
    if (b.width < 2 || b.height < 2) {
      console.warn(
        `[preview] open with tiny bounds session=${sessionId} ${b.width}x${b.height}`,
      );
    }
    this.applyBounds(s.view, s.bounds);
    s.view.setVisible(true);
    void s.view.webContents
      .loadURL(url)
      .catch((err) => this.emitLoadError(sessionId, url, err));
  }

  updateBounds(sessionId: string, bounds: PreviewBounds): void {
    const s = this.surfaces.get(sessionId);
    if (!s || s.detached || !s.view) return;
    s.bounds = normalizeBounds(bounds);
    this.applyBounds(s.view, s.bounds);
  }

  private applyBounds(view: WebContentsView, bounds: Required<PreviewBounds>) {
    view.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    try {
      view.webContents.setZoomFactor(bounds.zoom);
    } catch {
      /* ignore */
    }
  }

  setDetached(
    sessionId: string,
    url: string,
    bounds: PreviewBounds,
    detached: boolean,
  ): void {
    const s = this.getOrCreateState(sessionId);
    s.currentUrl = url;
    if (detached) {
      this.detach(sessionId, url);
    } else {
      this.open(sessionId, url, bounds);
    }
    s.detached = detached;
    this.emitToApp("desktop-preview:detached-changed", {
      type: "atmos-preview:detached-changed",
      sessionId,
      detached,
    });
  }

  private detach(sessionId: string, url: string): void {
    const s = this.getOrCreateState(sessionId);
    if (s.view) {
      const host = this.state.mainWindow;
      if (host && !host.isDestroyed()) {
        host.contentView.removeChildView(s.view);
      }
      this.destroyViewWebContents(s.view);
      s.view = null;
    }

    if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      void s.detachedWindow
        .loadURL(url)
        .then(() => {
          s.detachedWindow?.show();
        })
        .catch((err) => this.emitLoadError(sessionId, url, err));
      return;
    }

    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 480,
      minHeight: 360,
      show: false,
      ...appWindowBranding("Atmos Electron Browser"),
      webPreferences: {
        session: this.previewSession,
        preload: previewPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    s.detachedWindow = win;
    win.on("closed", () => {
      if (s.detachedWindow === win) s.detachedWindow = null;
    });
    this.attachWebContentsListeners(sessionId, win.webContents);
    void win
      .loadURL(url)
      .then(() => {
        win.center();
        win.show();
      })
      .catch((err) => this.emitLoadError(sessionId, url, err));
  }

  navigate(sessionId: string, url: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.currentUrl = url;
    if (s.detached && s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      void s.detachedWindow
        .loadURL(url)
        .catch((err) => this.emitLoadError(sessionId, url, err));
      return;
    }
    if (s.view) {
      void s.view.webContents
        .loadURL(url)
        .catch((err) => this.emitLoadError(sessionId, url, err));
    }
  }

  enterPickMode(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.pickMode = true;
    const wc = this.webContentsFor(s);
    if (wc) void this.evalPickMode(wc, sessionId, true, s.bridgeToken);
  }

  clearSelection(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.pickMode = false;
    const wc = this.webContentsFor(s);
    if (wc) void this.evalPickMode(wc, sessionId, false, s.bridgeToken);
  }

  clearAnnotations(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    const wc = this.webContentsFor(s);
    if (!wc) return;
    void wc.executeJavaScript(
      `window.__ATMOS_DESKTOP_PREVIEW_BRIDGE__?.clearAnnotations?.();`,
      true,
    );
  }

  openDevtools(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) throw new Error("preview inspector window not open");
    const wc = this.webContentsFor(s);
    if (!wc) throw new Error("preview inspector window not open");
    wc.openDevTools({ mode: "detach" });
  }

  close(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    if (s.view) {
      const host = this.state.mainWindow;
      if (host && !host.isDestroyed()) {
        try {
          host.contentView.removeChildView(s.view);
        } catch {
          /* ignore */
        }
      }
      // Match detach(): tear down WebContents so open/close does not leak renderers.
      this.destroyViewWebContents(s.view);
      s.view = null;
    }
    if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      s.detachedWindow.close();
    }
    this.surfaces.delete(sessionId);
  }

  show(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.visible = true;
    s.view?.setVisible(true);
    s.detachedWindow?.show();
  }

  hide(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.visible = false;
    s.view?.setVisible(false);
  }

  private webContentsFor(
    s: SurfaceState,
  ): Electron.WebContents | null {
    if (s.detached && s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      return s.detachedWindow.webContents;
    }
    return s.view?.webContents ?? null;
  }

  /**
   * Forward preview runtime events to the product UI after session/token gate
   * and desktop-preview:* remapping (Tauri parity).
   */
  forwardRuntimeEvent(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const sessionId = String(
      (payload as { sessionId?: unknown; session_id?: unknown }).sessionId ??
        (payload as { session_id?: unknown }).session_id ??
        "",
    );
    const surface = sessionId ? this.surfaces.get(sessionId) : undefined;
    const gated = gateAndRemapRuntimeEvent(
      payload,
      surface?.bridgeToken,
      this.knownSessionIds(),
    );
    if (!gated) return;

    const eventType = String((payload as { type?: unknown }).type ?? "");
    if (
      surface &&
      (eventType === "atmos-preview:ready" ||
        eventType === "atmos-preview:navigation-changed")
    ) {
      const pageUrl = gated.body.pageUrl;
      if (typeof pageUrl === "string") surface.currentUrl = pageUrl;
    }

    this.emitToApp(gated.channel, gated.body);
  }

  getPreviewSession(): Session {
    return this.previewSession;
  }
}
