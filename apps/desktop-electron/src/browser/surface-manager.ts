/**
 * Desktop browser surfaces via in-DOM Electron `<webview>` + shared partition (APP-053).
 * In-panel content is created by the host renderer; this manager registers sessions,
 * enforces attach policy, binds guest WebContents, injects runtime, and owns detach.
 */

import {
  BrowserWindow,
  session,
  type Session,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AppState } from "../app-state.js";
import { appWindowBranding } from "../branding.js";
import { areDevToolsAllowed } from "../devtools-policy.js";
import type { PreviewBounds } from "../types.js";
import {
  buildOpenTabEventPayload,
  gateAndRemapRuntimeEvent,
  openTabTargetFromWindowOpenUrl,
} from "./runtime-events.js";
import {
  BROWSER_PARTITION,
  toPreloadFileUrl,
  type RegisteredBrowserSession,
} from "./webview-attach-policy.js";

const requireElectron = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "packages/shared/browser/browser-runtime.js"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "../../..");
}
const REPO_ROOT = findRepoRoot(__dirname);

export type BrowserAttachConfig = {
  partition: string;
  preloadUrl: string;
  bridgeToken: string;
  sessionId: string;
};

type GuestColorScheme = "light" | "dark";

type SurfaceState = {
  sessionId: string;
  bridgeToken: string;
  currentUrl: string;
  detached: boolean;
  pickMode: boolean;
  pendingAttach: boolean;
  guestWebContents: WebContents | null;
  guestWebContentsId: number | null;
  hostWindow: BrowserWindow | null;
  detachedWindow: BrowserWindow | null;
  listenersAttached: boolean;
  /**
   * Preferred color scheme mirrored from Atmos host theme so guest scrollbars
   * and prefers-color-scheme match Chrome-on-dark rather than always-light.
   */
  preferredColorScheme: GuestColorScheme;
};

function browserRuntimeScriptPath(): string {
  return join(REPO_ROOT, "packages/shared/browser/browser-runtime.js");
}

function browserPreloadPath(): string {
  // Built as CommonJS (.cjs) so sandboxed guest preloads can load.
  const candidates = [
    join(__dirname, "browser-preload.cjs"),
    join(__dirname, "browser-preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

function buildBridgeInjection(bridgeToken: string): string {
  const runtimePath = browserRuntimeScriptPath();
  const runtime = existsSync(runtimePath)
    ? readFileSync(runtimePath, "utf8")
    : "/* browser-runtime.js missing */";
  if (!existsSync(runtimePath)) {
    console.error(`[browser] runtime script missing: ${runtimePath}`);
  }
  const tokenJson = JSON.stringify(bridgeToken);
  // Host SelectionPopover owns toolbar chrome — guest toolbar off (APP-053).
  return `
${runtime}
(() => {
  if (window.__ATMOS_DESKTOP_BROWSER_BRIDGE__) return;
  const invoke = window.__ATMOS_BROWSER_INVOKE__;
  if (!invoke) {
    console.error('[atmos-browser] __ATMOS_BROWSER_INVOKE__ missing — browser preload failed');
    return;
  }
  if (!window.__ATMOS_BROWSER_RUNTIME__) {
    console.error('[atmos-browser] __ATMOS_BROWSER_RUNTIME__ missing — runtime inject failed');
    return;
  }
  const bridgeToken = ${tokenJson};
  const controller = window.__ATMOS_BROWSER_RUNTIME__.createRuntime({
    win: window,
    // Host SelectionPopover owns toolbar chrome; guest still draws pick hover/lock labels.
    showSelectionToolbar: false,
    showHoverLabel: true,
    emit(message) {
      invoke('browser_bridge_event', {
        payload: Object.assign({}, message, { bridgeToken })
      }).catch((err) => {
        console.error('[atmos-browser] emit failed', err);
      });
    },
  });
  window.__ATMOS_DESKTOP_BROWSER_BRIDGE__ = {
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

export class BrowserSurfaceManager {
  private readonly surfaces = new Map<string, SurfaceState>();
  private readonly browserSession: Session;
  /** FIFO of sessionIds that passed will-attach and await did-attach bind. */
  private readonly attachQueue: string[] = [];

  constructor(private readonly state: AppState) {
    this.browserSession = session.fromPartition(BROWSER_PARTITION);
  }

  getPreloadAbsolutePath(): string {
    return browserPreloadPath();
  }

  getAttachConfig(sessionId: string): BrowserAttachConfig | null {
    const s = this.surfaces.get(sessionId);
    if (!s) return null;
    return {
      partition: BROWSER_PARTITION,
      preloadUrl: toPreloadFileUrl(this.getPreloadAbsolutePath()),
      // pathToFileURL is more correct on Windows; keep policy helper for tests
      bridgeToken: s.bridgeToken,
      sessionId,
    };
  }

  /** Prefer pathToFileURL for production preload attribute. */
  getPreloadFileUrl(): string {
    const abs = this.getPreloadAbsolutePath();
    try {
      return pathToFileURL(abs).href;
    } catch {
      return toPreloadFileUrl(abs);
    }
  }

  listRegisteredSessions(): RegisteredBrowserSession[] {
    return Array.from(this.surfaces.values()).map((s) => ({
      sessionId: s.sessionId,
      url: s.currentUrl,
      pendingAttach: s.pendingAttach,
    }));
  }

  markAttachAllowed(sessionId: string, src: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    if (src && src !== "about:blank") {
      s.currentUrl = src;
    }
    // Consume pending immediately so a second concurrent same-URL attach cannot
    // re-select this session (APP-053 dual-tab bind).
    s.pendingAttach = false;
    // Keep at most one queue entry per session (re-ALLOW must not duplicate FIFO slots).
    if (!this.attachQueue.includes(sessionId)) {
      this.attachQueue.push(sessionId);
    }
  }

  /**
   * Prefer session stamped on the guest via will-attach additionalArguments.
   * FIFO attachQueue is fallback only when args are missing.
   */
  private sessionIdFromGuestWebContents(guestWc: WebContents): string | null {
    try {
      // Electron WebContents may expose getLastWebPreferences at runtime (not always in typings).
      const wcWithPrefs = guestWc as WebContents & {
        getLastWebPreferences?: () => { additionalArguments?: unknown };
      };
      const prefs =
        typeof wcWithPrefs.getLastWebPreferences === "function"
          ? wcWithPrefs.getLastWebPreferences()
          : null;
      const args = prefs?.additionalArguments;
      if (!Array.isArray(args)) return null;
      for (const arg of args) {
        if (typeof arg !== "string") continue;
        const m = /^--atmos-browser-session=(.+)$/.exec(arg);
        if (m?.[1]?.trim()) return m[1].trim();
      }
    } catch {
      /* guest prefs unavailable */
    }
    return null;
  }

  private takeAttachQueueSession(sessionId: string): void {
    const idx = this.attachQueue.indexOf(sessionId);
    if (idx >= 0) this.attachQueue.splice(idx, 1);
  }

  onGuestAttached(guestWc: WebContents): void {
    const fromArgs = this.sessionIdFromGuestWebContents(guestWc);
    const sessionId =
      fromArgs ?? this.attachQueue.shift() ?? this.findPendingSessionId();
    if (!sessionId) {
      console.warn("[browser] did-attach-webview with no pending session");
      return;
    }
    if (fromArgs) {
      this.takeAttachQueueSession(sessionId);
    }
    this.bindGuestWebContents(sessionId, guestWc);
  }

  private findPendingSessionId(): string | null {
    for (const s of this.surfaces.values()) {
      if (s.pendingAttach) return s.sessionId;
    }
    return null;
  }

  bindGuest(sessionId: string, webContentsId: number): void {
    // Lazy load so headless router smoke can import handlers without resolving Electron runtime exports.
    const electron = requireElectron("electron") as typeof import("electron");
    const wc = electron.webContents.fromId(webContentsId);
    if (!wc || wc.isDestroyed()) {
      throw new Error(`browser guest webContents not found: ${webContentsId}`);
    }
    // Host bind is authoritative (dom-ready webContentsId) — always rebind if WC changed.
    this.bindGuestWebContents(sessionId, wc);
  }

  private bindGuestWebContents(sessionId: string, wc: WebContents): void {
    const s = this.getOrCreateState(sessionId);
    const prevId = s.guestWebContentsId;
    const needsListeners = !s.listenersAttached || prevId !== wc.id;

    s.guestWebContents = wc;
    s.guestWebContentsId = wc.id;
    s.pendingAttach = false;
    this.takeAttachQueueSession(sessionId);

    if (needsListeners) {
      this.attachWebContentsListeners(sessionId, wc);
      s.listenersAttached = true;
    }

    // Default-deny guest permissions (media/notifications/etc.). Intentional lockdown.
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    void this.applyGuestColorScheme(s);

    wc.once("destroyed", () => {
      const cur = this.surfaces.get(sessionId);
      if (cur && cur.guestWebContentsId === wc.id) {
        cur.guestWebContents = null;
        cur.guestWebContentsId = null;
        cur.listenersAttached = false;
        // Only re-pending when surface still open (host will remount webview).
        // Detached window path does not need in-panel re-attach.
        cur.pendingAttach = !cur.detached && this.surfaces.has(sessionId);
      }
    });
  }

  resolveHostWindow(preferred?: BrowserWindow | null): BrowserWindow {
    if (preferred && !preferred.isDestroyed()) {
      return preferred;
    }
    const main = this.state.mainWindow;
    if (main && !main.isDestroyed()) {
      return main;
    }
    throw new Error("browser host window not available: main");
  }

  private surfaceHost(s: SurfaceState): BrowserWindow | null {
    if (s.hostWindow && !s.hostWindow.isDestroyed()) {
      return s.hostWindow;
    }
    const main = this.state.mainWindow;
    if (main && !main.isDestroyed()) {
      return main;
    }
    return null;
  }

  private getOrCreateState(sessionId: string): SurfaceState {
    let s = this.surfaces.get(sessionId);
    if (!s) {
      s = {
        sessionId,
        bridgeToken: randomUUID(),
        currentUrl: "about:blank",
        detached: false,
        pickMode: false,
        pendingAttach: false,
        guestWebContents: null,
        guestWebContentsId: null,
        hostWindow: null,
        detachedWindow: null,
        listenersAttached: false,
        // Match Atmos defaultTheme="dark".
        preferredColorScheme: "dark",
      };
      this.surfaces.set(sessionId, s);
    }
    return s;
  }

  /**
   * Sync Atmos host theme into the guest so scrollbars / form controls / sites
   * that honor prefers-color-scheme behave like system Chrome.
   */
  setPreferredColorScheme(
    sessionId: string,
    scheme: GuestColorScheme,
  ): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    if (scheme !== "light" && scheme !== "dark") return;
    s.preferredColorScheme = scheme;
    void this.applyGuestColorScheme(s);
  }

  private async applyGuestColorScheme(s: SurfaceState): Promise<void> {
    const wc = this.webContentsFor(s);
    if (!wc || wc.isDestroyed()) return;
    const scheme = s.preferredColorScheme;
    const css = `:root, html { color-scheme: ${scheme} !important; }`;
    try {
      await wc.insertCSS(css);
    } catch {
      /* navigation mid-flight */
    }
    try {
      await wc.executeJavaScript(
        `(() => {
          var scheme = ${JSON.stringify(scheme)};
          try {
            document.documentElement.style.colorScheme = scheme;
            document.documentElement.setAttribute('data-atmos-color-scheme', scheme);
          } catch (_) {}
        })();`,
        true,
      );
    } catch {
      /* guest not ready */
    }
    // Emulate prefers-color-scheme media so dark sites (e.g. skills.sh) style
    // scrollbars like Chrome. Re-applied on every navigation in onBrowserPageFinished.
    try {
      const dbg = wc.debugger;
      let attachedHere = false;
      if (!dbg.isAttached()) {
        dbg.attach("1.3");
        attachedHere = true;
      }
      await dbg.sendCommand("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: scheme }],
      });
      if (attachedHere) {
        try {
          dbg.detach();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* debugger busy (DevTools) — insertCSS / color-scheme still applied */
    }
  }

  private emitToApp(
    channel: string,
    payload: unknown,
    host?: BrowserWindow | null,
  ) {
    const targets = new Set<BrowserWindow>();
    if (host && !host.isDestroyed()) {
      targets.add(host);
    }
    if (targets.size === 0) {
      const main = this.state.mainWindow;
      if (main && !main.isDestroyed()) {
        targets.add(main);
      }
    }
    for (const win of targets) {
      win.webContents.send(`atmos:desktop-event:${channel}`, payload);
    }
  }

  private emitToSession(sessionId: string, channel: string, payload: unknown) {
    const s = this.surfaces.get(sessionId);
    this.emitToApp(channel, payload, s ? this.surfaceHost(s) : null);
  }

  private emitLoadError(sessionId: string, url: string, err: unknown) {
    console.error(`[browser] loadURL failed session=${sessionId}`, err);
    this.emitToSession(sessionId, "desktop-browser:error", {
      type: "atmos-browser:error",
      sessionId,
      pageUrl: url,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  bridgeTokenFor(sessionId: string): string | null {
    return this.surfaces.get(sessionId)?.bridgeToken ?? null;
  }

  knownSessionIds(): Set<string> {
    return new Set(this.surfaces.keys());
  }

  /** Bound guest WebContents for Browser Use embedded control (APP-053). */
  getGuestWebContents(sessionId: string): WebContents | null {
    const s = this.surfaces.get(sessionId);
    const g = s?.guestWebContents;
    if (g && !g.isDestroyed()) return g;
    return null;
  }

  /** Host BrowserWindow for a browser session (main or standalone). */
  getHostWindowForSession(sessionId: string): BrowserWindow | null {
    const s = this.surfaces.get(sessionId);
    if (s) return this.surfaceHost(s);
    const main = this.state.mainWindow;
    if (main && !main.isDestroyed()) return main;
    return null;
  }

  /**
   * Session summaries for `atmos browser-use --backend embedded` prepare/state bind.
   */
  listBrowserUseSessions(): Array<{
    target_id: string;
    tab_id: string;
    url: string;
    title: string;
    bound: boolean;
  }> {
    const out: Array<{
      target_id: string;
      tab_id: string;
      url: string;
      title: string;
      bound: boolean;
    }> = [];
    for (const s of this.surfaces.values()) {
      const g = s.guestWebContents;
      const bound = Boolean(g && !g.isDestroyed());
      out.push({
        target_id: s.sessionId,
        tab_id: "main",
        url: bound ? g!.getURL() : s.currentUrl,
        title: bound ? g!.getTitle() : "",
        bound,
      });
    }
    return out;
  }

  private attachWebContentsListeners(
    sessionId: string,
    wc: WebContents,
  ) {
    wc.setWindowOpenHandler((details) => {
      const targetUrl = openTabTargetFromWindowOpenUrl(details.url);
      if (targetUrl) {
        let pageUrl = "";
        try {
          pageUrl = wc.isDestroyed() ? "" : wc.getURL();
        } catch {
          pageUrl = "";
        }
        this.emitToSession(
          sessionId,
          "desktop-browser:open-tab",
          buildOpenTabEventPayload({
            sessionId,
            pageUrl,
            targetUrl,
          }),
        );
      }
      return { action: "deny" };
    });
    wc.on("did-finish-load", () => {
      const s = this.surfaces.get(sessionId);
      if (!s) return;
      const url = wc.getURL();
      s.currentUrl = url;
      void this.onBrowserPageFinished(
        wc,
        sessionId,
        url,
        s.bridgeToken,
        s.pickMode,
      );
    });
    wc.on("did-fail-load", (_e, code, desc, validatedURL) => {
      if (code === -3) return;
      console.error(
        `[browser] did-fail-load session=${sessionId} code=${code} ${desc} url=${validatedURL}`,
      );
      this.emitToSession(sessionId, "desktop-browser:error", {
        type: "atmos-browser:error",
        sessionId,
        pageUrl: validatedURL,
        error: desc || `load failed (${code})`,
      });
    });
    wc.on("page-title-updated", (_e, title) => {
      const s = this.surfaces.get(sessionId);
      if (!s) return;
      const pageTitle = (title || "").trim();
      if (!pageTitle) return;
      this.emitToSession(sessionId, "desktop-browser:title-changed", {
        type: "atmos-browser:title-changed",
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
      this.emitToSession(sessionId, "desktop-browser:title-changed", {
        type: "atmos-browser:title-changed",
        sessionId,
        pageUrl: wc.getURL(),
        ...(pageTitle ? { pageTitle } : {}),
        faviconUrl,
      });
    });
  }

  private async onBrowserPageFinished(
    wc: WebContents,
    sessionId: string,
    url: string,
    bridgeToken: string,
    pickMode: boolean,
  ): Promise<void> {
    this.emitToSession(sessionId, "desktop-browser:navigation-changed", {
      type: "atmos-browser:navigation-changed",
      sessionId,
      pageUrl: url,
      pageTitle: (wc.getTitle() || "").trim() || undefined,
    });
    await this.injectAndSync(
      wc,
      sessionId,
      bridgeToken,
      pickMode ? "enterPickMode" : "announceReady",
    );
    const surface = this.surfaces.get(sessionId);
    if (surface) {
      void this.applyGuestColorScheme(surface);
    }
  }

  private async injectBridge(
    wc: WebContents,
    bridgeToken: string,
  ): Promise<boolean> {
    try {
      await wc.executeJavaScript(buildBridgeInjection(bridgeToken), true);
      const ok = await wc.executeJavaScript(
        `Boolean(window.__ATMOS_DESKTOP_BROWSER_BRIDGE__ && window.__ATMOS_BROWSER_INVOKE__)`,
        true,
      );
      if (!ok) {
        console.error(
          "[browser] injectBridge: bridge missing after inject (preload invoke or runtime failed)",
        );
      }
      return Boolean(ok);
    } catch (e) {
      console.error("[browser] injectBridge failed", e);
      return false;
    }
  }

  private async syncSessionBridge(
    wc: WebContents,
    sessionId: string,
    method: "announceReady" | "enterPickMode" | "clearSelection",
  ): Promise<void> {
    const sessionJson = JSON.stringify(sessionId);
    const methodJson = JSON.stringify(method);
    const script = `
(() => {
  const sessionId = ${sessionJson};
  const method = ${methodJson};
  window.__ATMOS_BROWSER_SESSION_ID__ = sessionId;
  let attempts = 0;
  const sync = () => {
    const bridge = window.__ATMOS_DESKTOP_BROWSER_BRIDGE__;
    if (bridge && typeof bridge[method] === 'function') {
      bridge[method](sessionId);
      return true;
    }
    attempts += 1;
    if (attempts < 40) {
      window.setTimeout(sync, 50);
      return false;
    }
    console.error('[atmos-browser] syncSessionBridge timed out method=' + method);
    return false;
  };
  return sync();
})();
`;
    try {
      await wc.executeJavaScript(script, true);
    } catch (e) {
      console.error("[browser] syncSessionBridge failed", e);
    }
  }

  private async injectAndSync(
    wc: WebContents,
    sessionId: string,
    bridgeToken: string,
    method: "announceReady" | "enterPickMode" | "clearSelection",
  ): Promise<void> {
    await this.injectBridge(wc, bridgeToken);
    await this.syncSessionBridge(wc, sessionId, method);
  }

  private async evalPickMode(
    wc: WebContents,
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

  /**
   * Register a desktop browser session for webview attach.
   * Does not create a native child view — host mounts `<webview>`.
   *
   * Navigation ownership (in-panel): the host `<webview>` src/loadURL is the
   * single load owner. open() must not call guest.loadURL when a guest already
   * exists — that raced with DesktopBrowserWebview and caused double loads.
   */
  open(
    sessionId: string,
    url: string,
    _bounds?: PreviewBounds | null,
    hostWindow?: BrowserWindow | null,
  ): BrowserAttachConfig {
    const s = this.getOrCreateState(sessionId);
    const host = this.resolveHostWindow(hostWindow ?? s.hostWindow);
    s.hostWindow = host;
    s.currentUrl = url;
    s.detached = false;
    s.pickMode = false;

    if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      s.detachedWindow.close();
      s.detachedWindow = null;
    }

    // Guest already bound: host webview owns navigation. Only bookkeep URL.
    // No guest: mark pending for will-attach; host mounts with src.
    if (s.guestWebContents && !s.guestWebContents.isDestroyed()) {
      s.pendingAttach = false;
    } else {
      s.pendingAttach = true;
    }

    return {
      partition: BROWSER_PARTITION,
      preloadUrl: this.getPreloadFileUrl(),
      bridgeToken: s.bridgeToken,
      sessionId,
    };
  }

  /**
   * Legacy surface detach into a bare BrowserWindow on the same partition.
   * Product "Open in window" uses `open_browser_window` (full Atmos `/browser` shell)
   * instead — keep this IPC for potential future dock/pop-out, not product toolbar.
   */
  setDetached(
    sessionId: string,
    url: string,
    bounds: PreviewBounds,
    detached: boolean,
    hostWindow?: BrowserWindow | null,
  ): void {
    const s = this.getOrCreateState(sessionId);
    if (hostWindow && !hostWindow.isDestroyed()) {
      s.hostWindow = hostWindow;
    }
    s.currentUrl = url;
    if (detached) {
      this.detach(sessionId, url);
    } else {
      // Return to in-panel webview: clear detached window; host remounts/navigates.
      if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
        s.detachedWindow.close();
        s.detachedWindow = null;
      }
      s.detached = false;
      s.pendingAttach = true;
      s.guestWebContents = null;
      s.guestWebContentsId = null;
      s.listenersAttached = false;
      void bounds;
    }
    s.detached = detached;
    this.emitToSession(sessionId, "desktop-browser:detached-changed", {
      type: "atmos-browser:detached-changed",
      sessionId,
      detached,
    });
  }

  private detach(sessionId: string, url: string): void {
    const s = this.getOrCreateState(sessionId);
    // Blur guest before dropping in-panel association (macOS focus safety).
    try {
      if (s.guestWebContents && !s.guestWebContents.isDestroyed()) {
        s.guestWebContents.setAudioMuted(true);
      }
    } catch {
      /* ignore */
    }
    s.guestWebContents = null;
    s.guestWebContentsId = null;
    s.listenersAttached = false;
    s.pendingAttach = false;

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
      ...appWindowBranding("Atmos Browser"),
      webPreferences: {
        session: this.browserSession,
        preload: browserPreloadPath(),
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
    s.listenersAttached = true;
    void win
      .loadURL(url)
      .then(() => {
        win.center();
        win.show();
      })
      .catch((err) => this.emitLoadError(sessionId, url, err));
  }

  /**
   * Navigate guest. In-panel webview is host-owned — only detached windows
   * load here. In-panel calls update currentUrl bookkeeping only (no loadURL).
   */
  navigate(sessionId: string, url: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    s.currentUrl = url;
    if (s.detached && s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      void s.detachedWindow
        .loadURL(url)
        .catch((err) => this.emitLoadError(sessionId, url, err));
    }
    // In-panel: host <webview> src/loadURL is the sole navigation owner.
  }

  /** Optional page zoom (no product toolbar yet). Safe no-op when unbound. */
  setZoom(sessionId: string, zoom: number): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    const factor = Math.min(10, Math.max(0.2, zoom));
    const wc = this.webContentsFor(s);
    if (!wc) return;
    try {
      wc.setZoomFactor(factor);
    } catch {
      /* ignore */
    }
  }

  /**
   * Resolve element rects in the guest for host annotation overlays after scroll.
   * Selectors that miss or throw return rect: null.
   */
  async queryElementRects(
    sessionId: string,
    selectors: string[],
  ): Promise<Array<{ selector: string; rect: { x: number; y: number; width: number; height: number } | null }>> {
    const s = this.surfaces.get(sessionId);
    if (!s) return selectors.map((selector) => ({ selector, rect: null }));
    const wc = this.webContentsFor(s);
    if (!wc || wc.isDestroyed()) {
      return selectors.map((selector) => ({ selector, rect: null }));
    }
    const unique = [...new Set(selectors.filter((sel) => typeof sel === "string" && sel.length > 0))];
    if (unique.length === 0) return [];
    const script = `(() => {
      const selectors = ${JSON.stringify(unique)};
      return selectors.map(function (selector) {
        try {
          var el = document.querySelector(selector);
          if (!el) return { selector: selector, rect: null };
          var r = el.getBoundingClientRect();
          return {
            selector: selector,
            rect: { x: r.left, y: r.top, width: r.width, height: r.height },
          };
        } catch (_) {
          return { selector: selector, rect: null };
        }
      });
    })()`;
    try {
      const result = await wc.executeJavaScript(script, true);
      if (!Array.isArray(result)) {
        return unique.map((selector) => ({ selector, rect: null }));
      }
      return result as Array<{
        selector: string;
        rect: { x: number; y: number; width: number; height: number } | null;
      }>;
    } catch (e) {
      console.error("[browser] queryElementRects failed", e);
      return unique.map((selector) => ({ selector, rect: null }));
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
      `window.__ATMOS_DESKTOP_BROWSER_BRIDGE__?.clearAnnotations?.();`,
      true,
    );
  }

  openDevtools(sessionId: string): void {
    if (!areDevToolsAllowed()) return;

    const s = this.surfaces.get(sessionId);
    if (!s) throw new Error("browser surface not open");
    const wc = this.webContentsFor(s);
    if (!wc) throw new Error("browser guest not bound");
    wc.openDevTools({ mode: "detach" });
  }

  close(sessionId: string): void {
    const s = this.surfaces.get(sessionId);
    if (!s) return;
    try {
      if (s.guestWebContents && !s.guestWebContents.isDestroyed()) {
        // Prefer blur-safe teardown; guest is destroyed with webview element in host.
        s.guestWebContents.setAudioMuted(true);
      }
    } catch {
      /* ignore */
    }
    s.guestWebContents = null;
    s.guestWebContentsId = null;
    if (s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      s.detachedWindow.close();
    }
    s.hostWindow = null;
    this.surfaces.delete(sessionId);
  }

  private webContentsFor(s: SurfaceState): WebContents | null {
    if (s.detached && s.detachedWindow && !s.detachedWindow.isDestroyed()) {
      return s.detachedWindow.webContents;
    }
    if (s.guestWebContents && !s.guestWebContents.isDestroyed()) {
      return s.guestWebContents;
    }
    return null;
  }

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
      (eventType === "atmos-browser:ready" ||
        eventType === "atmos-browser:navigation-changed")
    ) {
      const pageUrl = gated.body.pageUrl;
      if (typeof pageUrl === "string") surface.currentUrl = pageUrl;
    }

    this.emitToApp(
      gated.channel,
      gated.body,
      surface ? this.surfaceHost(surface) : null,
    );
  }

  getBrowserSession(): Session {
    return this.browserSession;
  }
}
