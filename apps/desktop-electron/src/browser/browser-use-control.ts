/**
 * Atmos Browser Use — host control plane for APP-053 embedded webviews.
 *
 * Exposes loopback HTTP for `atmos browser-use --backend embedded`.
 * Uses guest WebContents debugger / executeJavaScript (not user-Chrome prepare).
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { Debugger, DownloadItem, WebContents } from "electron";
import type { BrowserSurfaceManager } from "./surface-manager.js";
import {
  mapGuestRectToScreen,
  showEmbeddedBrowserChrome,
} from "./browser-use-chrome.js";
import { systemDownloadsDir } from "./system-downloads.js";

// Re-export chrome helpers for existing callers.
export { mapGuestRectToScreen, showEmbeddedBrowserChrome } from "./browser-use-chrome.js";

const CONTROL_DIR = () =>
  process.env.ATMOS_BROWSER_USE_HOME?.trim() ||
  join(homedir(), ".atmos", "data", "browser-use");

function readBrowserAgentChromeEnabled(): boolean {
  try {
    const raw = readFileSync(
      join(homedir(), ".atmos", "config", "function_settings.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      browser?: { show_agent_chrome?: boolean };
    };
    return parsed.browser?.show_agent_chrome !== false;
  } catch {
    return true;
  }
}

const DEFAULT_DOWNLOAD_ROOT = () => systemDownloadsDir();

const ALLOWED_NAV_SCHEMES = new Set(["http:", "https:", "about:"]);
const MAX_BODY_BYTES = 1_048_576;
const AGENT_TAB_TIMEOUT_MS = 15_000;
const SNAPSHOT_LIMIT = 200;

type SnapshotEl = {
  ref: string;
  tag: string;
  role: string | null;
  name: string;
  href?: string | null;
  value?: string | null;
  visible: boolean;
  rect: { x: number; y: number; width: number; height: number };
  selector?: string;
  note?: string;
  source?: string;
};

export type BrowserUseUserPick = {
  id?: string;
  source?: "current" | "annotation";
  selector: string;
  name?: string;
  note?: string;
  tag?: string;
  rect?: { x: number; y: number; width: number; height: number };
};

export type AgentTabAck = {
  requestId: string;
  ok: boolean;
  target_id?: string | null;
  tab_id?: string | null;
  evicted_target_ids?: string[];
  error?: string;
  error_code?: string;
};

type SessionCache = {
  elements: SnapshotEl[];
  url: string;
  title: string;
  generation: number;
  format: "embedded_dom_v1";
  truncated: boolean;
  total_candidates: number;
};

function isExactLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const raw = hostHeader.trim().toLowerCase();
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin || origin === "null") return true;
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function expandUserPath(raw: string): string {
  if (raw === "~") return homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return join(homedir(), raw.slice(2));
  }
  return raw;
}

function isPathInside(root: string, candidate: string): boolean {
  const rootPath = resolve(root) + sep;
  const resolved = resolve(candidate);
  return resolved === resolve(root) || resolved.startsWith(rootPath);
}

function isAllowedNavigateUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!ALLOWED_NAV_SCHEMES.has(url.protocol)) return false;
    if (url.protocol === "about:" && url.pathname !== "blank") return false;
    return true;
  } catch {
    return false;
  }
}

type PendingDialog = {
  dialog_id: string;
  type: string;
  message: string;
  default_prompt?: string;
  created_at: number;
};

export class BrowserUseControlPlane {
  private server: Server | null = null;
  private port = 0;
  private token = "";
  private readonly manager: BrowserSurfaceManager;
  private readonly snapshots = new Map<string, SessionCache>();
  private snapshotGeneration = 0;
  /** Latest JS dialog per guest session (CDP Page.javascriptDialogOpening). */
  private readonly pendingDialogs = new Map<string, PendingDialog>();
  /** Sessions with a long-lived debugger attach for dialog events. */
  private readonly dialogCdpSessions = new Set<string>();
  private dialogSeq = 0;
  /** Per-target FIFO so concurrent agent calls cannot interleave CDP. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Only intercept will-download while an agent download is armed. */
  private readonly armedDownloads = new Map<
    string,
    { dir: string; deadline: number }
  >();
  /** User pick / annotate payloads from the renderer (not clipboard). */
  private readonly userPicks = new Map<string, BrowserUseUserPick[]>();
  private readonly pendingAgentTabs = new Map<
    string,
    {
      resolve: (ack: AgentTabAck) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(manager: BrowserSurfaceManager) {
    this.manager = manager;
    this.manager.setOnBrowserUseNavigated((sessionId) => {
      this.invalidateSession(sessionId);
    });
    this.manager.setOnBrowserUseClosed((sessionId) => {
      this.invalidateSession(sessionId, {
        releaseDialog: true,
        dropQueue: true,
      });
    });
  }

  start(): { baseUrl: string; port: number } {
    if (this.server) {
      return { baseUrl: `http://127.0.0.1:${this.port}`, port: this.port };
    }
    this.token = randomBytes(32).toString("hex");
    const server = createServer((req, res) => {
      void this.handle(req, res);
    });
    // Handle async listen failures (e.g. EADDRINUSE) before listen() —
    // without a listener Node throws and can crash the desktop process.
    server.once("error", (err) => {
      console.error("[browser-use] control plane listen failed:", err);
      if (this.server === server) {
        this.server = null;
        this.port = 0;
      }
    });
    // Bind loopback only.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        this.port = addr.port;
        this.writeMeta();
        console.log(
          `[browser-use] control plane http://127.0.0.1:${this.port}`,
        );
      }
    });
    this.server = server;
    // port may still be 0 until listen callback; meta rewritten there
    return { baseUrl: `http://127.0.0.1:${this.port || 0}`, port: this.port };
  }

  stop(): void {
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    this.server = null;
    const meta = join(CONTROL_DIR(), "control.json");
    if (existsSync(meta)) {
      try {
        unlinkSync(meta);
      } catch {
        /* ignore */
      }
    }
  }

  private writeMeta(): void {
    const dir = CONTROL_DIR();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* best-effort on platforms that ignore mode */
    }
    const payload = {
      base_url: `http://127.0.0.1:${this.port}`,
      port: this.port,
      token: this.token,
      pid: process.pid,
      partition: "persist:atmos-browser",
      protocol: "atmos-browser-use/v1",
      updated_at: new Date().toISOString(),
    };
    const dest = join(dir, "control.json");
    const tmp = join(dir, `control.${process.pid}.json.tmp`);
    writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    try {
      chmodSync(tmp, 0o600);
    } catch {
      /* ignore */
    }
    renameSync(tmp, dest);
    try {
      chmodSync(dest, 0o600);
    } catch {
      /* ignore */
    }
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error("request body too large") as Error & {
          code?: string;
        };
        err.code = "invalid_args";
        throw err;
      }
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const err = new Error("request body is not valid JSON") as Error & {
        code?: string;
      };
      err.code = "invalid_args";
      throw err;
    }
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    });
    res.end(data);
  }

  private guestFor(sessionId: string): WebContents | null {
    return this.manager.getGuestWebContents(sessionId);
  }

  private listSessions(): Array<{
    target_id: string;
    tab_id: string;
    url: string;
    title: string;
    bound: boolean;
    focused: boolean;
  }> {
    return this.manager.listBrowserUseSessions();
  }

  private invalidateSession(
    sessionId: string,
    opts?: { releaseDialog?: boolean; dropQueue?: boolean },
  ): void {
    const id = sessionId.trim();
    if (!id) return;
    this.snapshots.delete(id);
    this.pendingDialogs.delete(id);
    this.userPicks.delete(id);
    this.armedDownloads.delete(id);
    this.removeGuestChrome(id);
    if (opts?.releaseDialog) {
      this.releaseDialogCdp(id);
    }
    if (opts?.dropQueue) {
      this.queues.delete(id);
    }
  }

  private removeGuestChrome(sessionId: string): void {
    const guest = this.guestFor(sessionId);
    if (!guest) return;
    void guest
      .executeJavaScript(
        `(() => {
          document.getElementById('atmos-browser-use-cursor')?.remove();
          document.getElementById('atmos-browser-use-badge')?.remove();
        })()`,
        true,
      )
      .catch(() => undefined);
  }

  private releaseDialogCdp(sessionId: string): void {
    this.dialogCdpSessions.delete(sessionId);
    const guest = this.guestFor(sessionId);
    if (!guest) return;
    try {
      if (guest.debugger.isAttached()) {
        guest.debugger.removeAllListeners("message");
        guest.debugger.detach();
      }
    } catch {
      /* ignore */
    }
  }

  setUserPicks(sessionId: string, picks: BrowserUseUserPick[]): void {
    const id = sessionId.trim();
    if (!id) return;
    const cleaned = picks.filter((pick) => pick.selector?.trim());
    if (cleaned.length === 0) {
      this.userPicks.delete(id);
      this.snapshots.delete(id);
      return;
    }
    this.userPicks.set(id, cleaned);
    this.snapshots.delete(id);
    this.manager.markLastActiveSession(id);
  }

  completeAgentTab(ack: AgentTabAck): void {
    const pending = this.pendingAgentTabs.get(ack.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAgentTabs.delete(ack.requestId);
    pending.resolve(ack);
  }

  private requestAgentTab(cmd: {
    action: string;
    url?: string;
    targetId?: string;
  }): Promise<AgentTabAck> {
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAgentTabs.delete(requestId);
        resolve({
          requestId,
          ok: false,
          error:
            "renderer did not handle the tab command (open a Browser tab in Desktop first)",
          error_code: "embedded_browser_host_unavailable",
        });
      }, AGENT_TAB_TIMEOUT_MS);
      this.pendingAgentTabs.set(requestId, { resolve, timer });
      const delivered = this.manager.emitAgentTab({
        requestId,
        action: cmd.action,
        url: cmd.url,
        targetId: cmd.targetId,
        preferredTargetId: cmd.targetId
          ? undefined
          : (this.manager.lastActiveBoundSessionId() ?? undefined),
      });
      if (!delivered) {
        clearTimeout(timer);
        this.pendingAgentTabs.delete(requestId);
        resolve({
          requestId,
          ok: false,
          error: cmd.targetId
            ? `unknown target_id ${cmd.targetId}`
            : "no Atmos Browser host window is available for this tab command",
          error_code: "browser_route_unavailable",
        });
      }
    });
  }

  private async querySelectorRect(
    guest: WebContents,
    selector: string,
  ): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
    tag: string;
  } | null> {
    try {
      const live = (await guest.executeJavaScript(
        `(() => {
          try {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              tag: el.tagName.toLowerCase(),
            };
          } catch {
            return null;
          }
        })()`,
        true,
      )) as {
        x: number;
        y: number;
        width: number;
        height: number;
        tag: string;
      } | null;
      if (!live || !Number.isFinite(live.width) || live.width < 1 || live.height < 1) {
        return null;
      }
      return live;
    } catch {
      return null;
    }
  }

  private enqueue<T>(targetId: string, fn: () => Promise<T>): Promise<T> {
    const key = targetId.trim() || "_global";
    // Target-scoped work (click/type after a bare `state`) must wait for the
    // in-flight ensure/snapshot, not race it on a parallel session queue.
    const ensureTail =
      key === "__ensure__"
        ? Promise.resolve()
        : (this.queues.get("__ensure__") ?? Promise.resolve());
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = Promise.all([ensureTail, prev])
      .catch(() => undefined)
      .then(fn);
    this.queues.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isBlankGuestUrl(url: string): boolean {
    const trimmed = url.trim();
    return !trimmed || trimmed === "about:blank" || trimmed === "about:blank#blocked";
  }

  private async waitForGuestReady(
    targetId: string,
    timeoutMs = 8_000,
  ): Promise<WebContents | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const guest = this.guestFor(targetId);
      if (guest && !guest.isDestroyed()) return guest;
      await this.sleep(50);
    }
    return this.guestFor(targetId);
  }

  private async waitForGuestNavigated(
    targetId: string,
    opts?: { expectedUrl?: string; requireNonBlank?: boolean; timeoutMs?: number },
  ): Promise<WebContents | null> {
    const timeoutMs = opts?.timeoutMs ?? 8_000;
    const guest = await this.waitForGuestReady(targetId, timeoutMs);
    if (!guest) return null;
    const expected = opts?.expectedUrl?.trim() ?? "";
    const requireNonBlank =
      opts?.requireNonBlank === true ||
      (Boolean(expected) && !this.isBlankGuestUrl(expected));
    if (!requireNonBlank) return guest;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (guest.isDestroyed()) return null;
      if (!this.isBlankGuestUrl(guest.getURL())) return guest;
      await this.sleep(50);
    }
    if (guest.isDestroyed()) return null;
    return this.isBlankGuestUrl(guest.getURL()) ? null : guest;
  }

  private markActivity(sessionId: string, status: string): void {
    try {
      this.manager.emitBrowserUseActivity(sessionId, status, true);
    } catch {
      /* best-effort */
    }
  }

  private async snapshot(
    sessionId: string,
    query?: string,
  ): Promise<SessionCache> {
    const guest = this.guestFor(sessionId);
    if (!guest) {
      const err = new Error(
        `no bound webview guest for target_id=${sessionId}; open Atmos Browser tab first`,
      ) as Error & { code?: string };
      err.code = "browser_route_unavailable";
      throw err;
    }
    this.snapshotGeneration += 1;
    const generation = this.snapshotGeneration;
    const script = `(() => {
      const query = ${JSON.stringify((query ?? "").trim().toLowerCase())};
      const limit = ${SNAPSHOT_LIMIT};
      const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
      const nodes = Array.from(document.querySelectorAll(selectors));
      const visible = [];
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (r.width < 2 || r.height < 2) continue;
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
        const name =
          (el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            (el.innerText || '').trim() ||
            el.getAttribute('href') ||
            '');
        const role = el.getAttribute('role') || '';
        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href') || '';
        if (
          query &&
          !name.toLowerCase().includes(query) &&
          !role.toLowerCase().includes(query) &&
          !tag.includes(query) &&
          !href.toLowerCase().includes(query)
        ) {
          continue;
        }
        visible.push({ el, name });
      }
      const secretType = (el) => {
        if (!(el instanceof HTMLInputElement)) return false;
        const type = (el.type || '').toLowerCase();
        const auto = (el.autocomplete || '').toLowerCase();
        const name = (el.name || el.id || '').toLowerCase();
        return (
          type === 'password' ||
          type === 'hidden' ||
          auto.includes('one-time-code') ||
          auto.includes('otp') ||
          name.includes('otp') ||
          name.includes('one-time')
        );
      };
      const truncated = visible.length > limit;
      const kept = visible.slice(0, limit);
      return {
        url: location.href,
        title: document.title || '',
        total_candidates: visible.length,
        truncated,
        elements: kept.map((item, i) => {
          const el = item.el;
          const r = el.getBoundingClientRect();
          return {
            ref: 'g${generation}:e' + i,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            name: String(item.name).slice(0, 120),
            href: el.getAttribute('href'),
            value: secretType(el)
              ? null
              : el.value != null
                ? String(el.value).slice(0, 200)
                : null,
            visible: true,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
      };
    })()`;
    const raw = (await guest.executeJavaScript(script, true)) as {
      url: string;
      title: string;
      elements: SnapshotEl[];
      truncated?: boolean;
      total_candidates?: number;
    };
    const domElements = Array.isArray(raw?.elements) ? raw.elements : [];
    const userEls: SnapshotEl[] = [];
    const picks = this.userPicks.get(sessionId) ?? [];
    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i];
      const live = await this.querySelectorRect(guest, pick.selector);
      if (!live) continue;
      userEls.push({
        ref: `g${generation}:u${i}`,
        tag: live.tag,
        role: "user_pick",
        name: (pick.name || pick.selector).slice(0, 120),
        visible: true,
        rect: { x: live.x, y: live.y, width: live.width, height: live.height },
        selector: pick.selector,
        note: pick.note,
        source: pick.source ?? "annotation",
      });
    }
    const totalCandidates =
      typeof raw?.total_candidates === "number"
        ? raw.total_candidates + userEls.length
        : domElements.length + userEls.length;
    const cache: SessionCache = {
      url: raw?.url ?? guest.getURL(),
      title: raw?.title ?? guest.getTitle(),
      elements: [...userEls, ...domElements],
      generation,
      format: "embedded_dom_v1",
      truncated: Boolean(raw?.truncated),
      total_candidates: totalCandidates,
    };
    this.snapshots.set(sessionId, cache);
    return cache;
  }

  private async respondSnapshot(
    res: ServerResponse,
    targetId: string,
    query: string | undefined,
    includeScreenshot: boolean,
  ): Promise<void> {
    const snap = await this.snapshot(targetId, query);
    const guest = this.guestFor(targetId);
    if (guest) {
      try {
        await this.armDialogListener(targetId, guest);
      } catch {
        /* optional */
      }
    }
    const screenshot = includeScreenshot
      ? await this.captureScreenshot(targetId)
      : null;
    const userPicks = snap.elements.filter((el) => el.source);
    this.send(res, 200, {
      ok: true,
      mode: "snapshot",
      snapshot_format: snap.format,
      generation: snap.generation,
      target_id: targetId,
      tab_id: "main",
      url: snap.url,
      title: snap.title,
      elements: snap.elements,
      element_count: snap.elements.length,
      truncated: snap.truncated,
      total_candidates: snap.total_candidates,
      user_picks: userPicks,
      pending_dialog: this.pendingDialogs.get(targetId) ?? null,
      ...(screenshot ? { screenshot } : {}),
    });
  }

  private async ensureBoundTarget(url?: string): Promise<AgentTabAck> {
    return this.requestAgentTab({
      action: "ensure-bind",
      url,
    });
  }

  /** Guest-local cursor overlay (no focus steal) plus optional host chrome. */
  private showChromeForRef(
    sessionId: string,
    el: SnapshotEl,
    status: string,
  ): void {
    if (!readBrowserAgentChromeEnabled()) return;
    this.markActivity(sessionId, status);
    const guest = this.guestFor(sessionId);
    if (guest) {
      const x = el.rect.x + Math.max(1, el.rect.width / 2);
      const y = el.rect.y + Math.max(1, el.rect.height / 2);
      void guest
        .executeJavaScript(
          `(() => {
            const id = 'atmos-browser-use-cursor';
            let node = document.getElementById(id);
            if (!node) {
              node = document.createElement('div');
              node.id = id;
              node.setAttribute('aria-hidden', 'true');
              node.style.cssText = 'position:fixed;z-index:2147483646;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #5b8cff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(91,140,255,.25)';
              document.documentElement.appendChild(node);
            }
            node.style.left = ${JSON.stringify(x)} + 'px';
            node.style.top = ${JSON.stringify(y)} + 'px';
            const badgeId = 'atmos-browser-use-badge';
            let badge = document.getElementById(badgeId);
            if (!badge) {
              badge = document.createElement('div');
              badge.id = badgeId;
              badge.setAttribute('aria-hidden', 'true');
              badge.style.cssText = 'position:fixed;z-index:2147483646;top:8px;right:8px;padding:4px 8px;border-radius:999px;background:rgba(20,20,20,.72);color:#fff;font:12px/1.2 system-ui,sans-serif;pointer-events:none';
              document.documentElement.appendChild(badge);
            }
            badge.textContent = ${JSON.stringify(status)};
          })()`,
          true,
        )
        .catch(() => undefined);
    }
    try {
      const host = this.manager.getHostWindowForSession(sessionId);
      if (!host || host.isDestroyed()) return;
      const content = host.getContentBounds();
      const mapped = mapGuestRectToScreen(content, el.rect);
      showEmbeddedBrowserChrome({
        status,
        cursor: mapped.cursor,
        bounds: mapped.bounds,
      });
    } catch (e) {
      console.warn("[browser-use] chrome failed", e);
    }
  }

  /**
   * Run CDP commands. Detaches only if we attached for this call and the session
   * is not holding a long-lived dialog CDP attach.
   */
  private async withDebugger<T>(
    guest: WebContents,
    sessionId: string | null,
    fn: (dbg: Debugger) => Promise<T>,
  ): Promise<T> {
    const dbg = guest.debugger;
    let attachedHere = false;
    try {
      if (!dbg.isAttached()) {
        dbg.attach("1.3");
        attachedHere = true;
      }
      return await fn(dbg);
    } finally {
      const hold =
        sessionId != null && this.dialogCdpSessions.has(sessionId);
      if (attachedHere && !hold) {
        try {
          dbg.detach();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async resolvePoint(
    sessionId: string,
    ref: string | null | undefined,
    x: number | null | undefined,
    y: number | null | undefined,
    status: string,
  ): Promise<{ x: number; y: number; ref: string | null }> {
    const hasXy =
      typeof x === "number" &&
      typeof y === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y);
    if (ref && String(ref).trim()) {
      const cache = this.snapshots.get(sessionId);
      if (!cache) {
        throw new Error(
          `unknown ref ${ref}; run state snapshot first (refs are snapshot-scoped)`,
        );
      }
      const el = cache.elements.find((e) => e.ref === ref);
      if (!el) {
        throw new Error(
          `unknown ref ${ref}; snapshot expired or ref is stale — run state snapshot first`,
        );
      }
      let rect = el.rect;
      if (el.selector) {
        const guest = this.guestFor(sessionId);
        const live = guest ? await this.querySelectorRect(guest, el.selector) : null;
        if (!live) {
          throw new Error(
            `unknown ref ${ref}; snapshot expired or ref is stale — run state snapshot first`,
          );
        }
        rect = { x: live.x, y: live.y, width: live.width, height: live.height };
        el.rect = rect;
        el.tag = live.tag;
      }
      this.showChromeForRef(sessionId, el, status);
      return {
        x: rect.x + Math.max(1, rect.width / 2),
        y: rect.y + Math.max(1, rect.height / 2),
        ref: el.ref,
      };
    }
    if (hasXy) {
      return { x: x as number, y: y as number, ref: null };
    }
    throw new Error("requires --ref or both --x and --y (viewport CSS px)");
  }

  private async dispatchClick(
    guest: WebContents,
    sessionId: string,
    x: number,
    y: number,
    opts?: { button?: "left" | "right" | "middle"; clickCount?: number },
  ): Promise<void> {
    const button = opts?.button ?? "left";
    const clickCount = opts?.clickCount ?? 1;
    await this.withDebugger(guest, sessionId, async (dbg) => {
      await dbg.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
      });
      await dbg.sendCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button,
        clickCount,
      });
      await dbg.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button,
        clickCount,
      });
    });
  }

  private async hitTest(
    guest: WebContents,
    x: number,
    y: number,
  ): Promise<{ tag: string; name: string } | null> {
    try {
      const hit = (await guest.executeJavaScript(
        `(() => {
          const el = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
          if (!el) return null;
          return {
            tag: el.tagName.toLowerCase(),
            name: (el.getAttribute('aria-label') || el.getAttribute('name') || (el.innerText || '').trim() || '').slice(0, 80),
          };
        })()`,
        true,
      )) as { tag: string; name: string } | null;
      return hit ?? null;
    } catch {
      return null;
    }
  }

  private async clickRef(
    sessionId: string,
    ref: string | null | undefined,
    x?: number | null,
    y?: number | null,
  ): Promise<{
    ref: string | null;
    x: number;
    y: number;
    hit?: { tag: string; name: string } | null;
  }> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const pt = await this.resolvePoint(sessionId, ref, x, y, "Clicking page");
    try {
      await this.dispatchClick(guest, sessionId, pt.x, pt.y, {
        button: "left",
        clickCount: 1,
      });
    } catch {
      if (!pt.ref) throw new Error("CDP click failed and no ref for DOM fallback");
      const cache = this.snapshots.get(sessionId);
      const el = cache?.elements.find((item) => item.ref === pt.ref);
      if (!el) throw new Error(`unknown ref ${pt.ref}; run state snapshot first`);
      await guest.executeJavaScript(
        `(() => {
          const x = ${JSON.stringify(pt.x)};
          const y = ${JSON.stringify(pt.y)};
          const node = document.elementFromPoint(x, y);
          if (!node) throw new Error('ref not found');
          node.focus?.();
          node.click?.();
          return true;
        })()`,
        true,
      );
    }
    const hit = await this.hitTest(guest, pt.x, pt.y);
    return { ...pt, hit };
  }

  private async typeRef(
    sessionId: string,
    ref: string | null | undefined,
    text: string,
    opts?: { replace?: boolean; mode?: string },
  ): Promise<void> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const replace = Boolean(opts?.replace);
    const mode = (opts?.mode || "insert_text").trim();
    if (ref) {
      const pt = await this.resolvePoint(sessionId, ref, null, null, "Typing in page");
      const cx = pt.x;
      const cy = pt.y;
      await guest.executeJavaScript(
        `(() => {
          const el = document.elementFromPoint(${JSON.stringify(cx)}, ${JSON.stringify(cy)});
          if (!el) throw new Error('ref not found');
          el.focus?.();
          if (${replace ? "true" : "false"}) {
            if ('value' in el) {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              el.textContent = '';
            }
          }
          return true;
        })()`,
        true,
      );
      try {
        await this.withDebugger(guest, sessionId, async (dbg) => {
          if (mode === "keystrokes") {
            for (const ch of text) {
              await dbg.sendCommand("Input.dispatchKeyEvent", {
                type: "keyDown",
                text: ch,
                unmodifiedText: ch,
              });
              await dbg.sendCommand("Input.dispatchKeyEvent", {
                type: "keyUp",
                text: ch,
                unmodifiedText: ch,
              });
            }
          } else {
            await dbg.sendCommand("Input.insertText", { text });
          }
        });
        return;
      } catch {
        /* DOM write fallback */
      }
      await guest.executeJavaScript(
        `(() => {
          const el = document.elementFromPoint(${JSON.stringify(cx)}, ${JSON.stringify(cy)});
          if (!el) throw new Error('ref not found');
          el.focus?.();
          if ('value' in el) {
            el.value = ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.isContentEditable) {
            el.textContent = ${JSON.stringify(text)};
          }
          return true;
        })()`,
        true,
      );
      return;
    }
    await guest.executeJavaScript(
      `(() => {
        const el = document.activeElement;
        if (!el) throw new Error('no focused element');
        if ('value' in el) {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = ${JSON.stringify(text)};
        }
        return true;
      })()`,
      true,
    );
  }

  /**
   * Keep a long-lived CDP attach so Page.javascriptDialogOpening can be observed.
   * Accept/dismiss uses the same attach via Page.handleJavaScriptDialog.
   */
  private async armDialogListener(
    sessionId: string,
    guest: WebContents,
  ): Promise<void> {
    if (this.dialogCdpSessions.has(sessionId) && guest.debugger.isAttached()) {
      return;
    }
    const dbg = guest.debugger;
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
    }
    const onMessage = (
      _event: unknown,
      method: string,
      params: unknown,
    ) => {
      if (method !== "Page.javascriptDialogOpening") return;
      const p = params as {
        type?: string;
        message?: string;
        defaultPrompt?: string;
      };
      this.dialogSeq += 1;
      this.pendingDialogs.set(sessionId, {
        dialog_id: `d${this.dialogSeq}`,
        type: p.type || "alert",
        message: p.message || "",
        default_prompt: p.defaultPrompt,
        created_at: Date.now(),
      });
    };
    dbg.removeAllListeners("message");
    dbg.on("message", onMessage);
    await dbg.sendCommand("Page.enable");
    this.dialogCdpSessions.add(sessionId);
  }

  private async pointerAction(
    sessionId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const action = String(body.action || "").trim();
    const ref =
      typeof body.ref === "string" && body.ref.trim() ? body.ref.trim() : null;
    const x = typeof body.x === "number" ? body.x : null;
    const y = typeof body.y === "number" ? body.y : null;
    const allowed = new Set([
      "hover",
      "right_click",
      "double_click",
      "scroll",
      "drag",
    ]);
    if (!allowed.has(action)) {
      throw new Error(
        "pointer action must be hover|right_click|double_click|scroll|drag",
      );
    }

    if (action === "scroll") {
      const pt =
        ref || (x != null && y != null)
          ? await this.resolvePoint(sessionId, ref, x, y, "Scrolling page")
          : { x: 0, y: 0, ref: null };
      const deltaX = typeof body.delta_x === "number" ? body.delta_x : 0;
      const deltaY = typeof body.delta_y === "number" ? body.delta_y : 0;
      await this.withDebugger(guest, sessionId, async (dbg) => {
        if (pt.x || pt.y) {
          await dbg.sendCommand("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: pt.x,
            y: pt.y,
          });
        }
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: pt.x,
          y: pt.y,
          deltaX,
          deltaY,
        });
      });
      return { action, delta_x: deltaX, delta_y: deltaY, ...pt };
    }

    if (action === "drag") {
      const from = await this.resolvePoint(
        sessionId,
        ref,
        x,
        y,
        "Dragging page",
      );
      let toX = typeof body.to_x === "number" ? body.to_x : null;
      let toY = typeof body.to_y === "number" ? body.to_y : null;
      const destRef =
        typeof body.destination_ref === "string" && body.destination_ref.trim()
          ? body.destination_ref.trim()
          : null;
      if (destRef) {
        const dest = await this.resolvePoint(
          sessionId,
          destRef,
          null,
          null,
          "Dragging page",
        );
        toX = dest.x;
        toY = dest.y;
      }
      if (toX == null || toY == null) {
        throw new Error("drag requires --to-x/--to-y or --destination-ref");
      }
      await this.withDebugger(guest, sessionId, async (dbg) => {
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: from.x,
          y: from.y,
        });
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: from.x,
          y: from.y,
          button: "left",
          clickCount: 1,
        });
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: toX,
          y: toY,
          button: "left",
        });
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: toX,
          y: toY,
          button: "left",
          clickCount: 1,
        });
      });
      return {
        action,
        from: { x: from.x, y: from.y, ref: from.ref },
        to: { x: toX, y: toY },
      };
    }

    const pt = await this.resolvePoint(
      sessionId,
      ref,
      x,
      y,
      action === "hover" ? "Hovering page" : "Pointer on page",
    );

    if (action === "hover") {
      await this.withDebugger(guest, sessionId, async (dbg) => {
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: pt.x,
          y: pt.y,
        });
      });
      return { action, ...pt };
    }

    if (action === "right_click") {
      await this.dispatchClick(guest, sessionId, pt.x, pt.y, {
        button: "right",
        clickCount: 1,
      });
      return { action, ...pt };
    }

    // double_click
    await this.dispatchClick(guest, sessionId, pt.x, pt.y, {
      button: "left",
      clickCount: 2,
    });
    return { action, ...pt };
  }

  private async dialogAction(
    sessionId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const action = String(body.action || "").trim();
    if (action === "inspect") {
      // Arm listener so subsequent page dialogs are captured; also return current pending.
      try {
        await this.armDialogListener(sessionId, guest);
      } catch (e) {
        console.warn("[browser-use] dialog arm failed", e);
      }
      const pending = this.pendingDialogs.get(sessionId) ?? null;
      return {
        action: "inspect",
        dialog: pending,
        has_dialog: Boolean(pending),
      };
    }
    if (action !== "accept" && action !== "dismiss") {
      throw new Error("dialog action must be inspect|accept|dismiss");
    }
    const dialogId =
      typeof body.dialog_id === "string" ? body.dialog_id.trim() : "";
    const pending = this.pendingDialogs.get(sessionId);
    if (!pending) {
      throw new Error(
        "no pending dialog; call dialog --action inspect after a page dialog appears",
      );
    }
    if (dialogId && dialogId !== pending.dialog_id) {
      throw new Error(
        `dialog_id mismatch (expected ${pending.dialog_id}, got ${dialogId})`,
      );
    }
    const promptText =
      typeof body.prompt_text === "string" ? body.prompt_text : undefined;
    await this.armDialogListener(sessionId, guest);
    await this.withDebugger(guest, sessionId, async (dbg) => {
      await dbg.sendCommand("Page.enable");
      await dbg.sendCommand("Page.handleJavaScriptDialog", {
        accept: action === "accept",
        ...(promptText != null ? { promptText } : {}),
      });
    });
    this.pendingDialogs.delete(sessionId);
    return {
      action,
      dialog_id: pending.dialog_id,
      resolved: true,
    };
  }

  private resolveDownloadDir(requested: string | undefined): string {
    const root = DEFAULT_DOWNLOAD_ROOT();
    mkdirSync(root, { recursive: true });
    if (!requested || !requested.trim()) return root;
    const candidate = resolve(expandUserPath(requested.trim()));
    if (!isPathInside(root, candidate)) {
      const err = new Error(
        `download dir must stay under ${root}`,
      ) as Error & { code?: string };
      err.code = "browser_download_denied";
      throw err;
    }
    mkdirSync(candidate, { recursive: true });
    return candidate;
  }

  private async downloadViaRef(
    sessionId: string,
    ref: string,
    dir: string | undefined,
  ): Promise<Record<string, unknown>> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const saveDir = this.resolveDownloadDir(dir);
    this.armedDownloads.set(sessionId, {
      dir: saveDir,
      deadline: Date.now() + 30_000,
    });

    const savePromise = new Promise<{
      path: string;
      filename: string;
      state: string;
    }>((resolvePromise, reject) => {
      let cleaned = false;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("download timed out (30s)"));
      }, 30_000);
      const onWillDownload = (
        _event: unknown,
        item: DownloadItem,
        wc?: WebContents,
      ) => {
        if (!wc || wc.id !== guest.id) return;
        const armed = this.armedDownloads.get(sessionId);
        if (!armed || Date.now() > armed.deadline) {
          return;
        }
        const filename = item.getFilename() || "download.bin";
        const savePath = join(armed.dir, basename(filename));
        item.setSavePath(savePath);
        item.once("done", (_e, state) => {
          cleanup();
          if (state === "completed") {
            resolvePromise({ path: savePath, filename, state });
          } else {
            reject(new Error(`download ${state}`));
          }
        });
      };
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        this.armedDownloads.delete(sessionId);
        try {
          guest.session.removeListener("will-download", onWillDownload);
        } catch {
          /* ignore */
        }
      };
      guest.session.on("will-download", onWillDownload);
      void this.clickRef(sessionId, ref).then(
        () => undefined,
        (error) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });

    const result = await savePromise;
    return {
      ok: true,
      ref,
      dir: saveDir,
      ...result,
    };
  }

  private async pressKey(
    sessionId: string,
    key: string,
    ref?: string | null,
  ): Promise<Record<string, unknown>> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    if (ref) {
      await this.resolvePoint(sessionId, ref, null, null, "Pressing key");
    }
    this.markActivity(sessionId, "Pressing key");
    await this.withDebugger(guest, sessionId, async (dbg) => {
      await dbg.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        windowsVirtualKeyCode: 0,
      });
      await dbg.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        windowsVirtualKeyCode: 0,
      });
    });
    return { key, ref: ref ?? null };
  }

  private async captureScreenshot(sessionId: string): Promise<string | null> {
    const guest = this.guestFor(sessionId);
    if (!guest) return null;
    try {
      const image = await guest.capturePage();
      return image.toPNG().toString("base64");
    } catch {
      return null;
    }
  }

  private authorize(req: IncomingMessage): string | null {
    if (!isExactLoopbackHost(req.headers.host)) {
      return "host must be exact loopback";
    }
    if (!isLoopbackOrigin(req.headers.origin)) {
      return "origin must be loopback or omitted";
    }
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!this.token || token !== this.token) {
      return "missing or invalid bearer token";
    }
    return null;
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const authError = this.authorize(req);
      if (authError) {
        this.send(res, 401, {
          ok: false,
          error: authError,
          error_code: "browser_control_auth_failed",
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/health") {
        this.send(res, 200, {
          ok: true,
          sessions: this.listSessions().length,
          capabilities: [
            "prepare",
            "state",
            "click",
            "type",
            "navigate",
            "pointer",
            "dialog",
            "download",
            "press-key",
            "end",
            "tabs",
          ],
        });
        return;
      }
      if (req.method !== "POST") {
        this.send(res, 405, {
          ok: false,
          error: "method not allowed",
          error_code: "invalid_args",
        });
        return;
      }
      const contentType = String(req.headers["content-type"] || "");
      if (contentType && !contentType.toLowerCase().includes("application/json")) {
        this.send(res, 415, {
          ok: false,
          error: "Content-Type must be application/json",
          error_code: "invalid_args",
        });
        return;
      }
      const body = await this.readBody(req);
      const path = url.pathname;
      const target =
        typeof body.target_id === "string" ? body.target_id.trim() : "";
      const ensureLike =
        !target &&
        (path === "/v1/state" ||
          (path === "/v1/tabs" && String(body.action || "").trim() === "open"));
      const queueKey = target || (ensureLike ? "__ensure__" : path);
      await this.enqueue(queueKey, () => this.dispatch(path, body, res));
    } catch (e) {
      this.sendFailure(res, e);
    }
  }

  private sendFailure(res: ServerResponse, e: unknown): void {
    console.error("[browser-use] control plane request failed:", e);
    const msg = e instanceof Error ? e.message : "browser engine failed";
    const code =
      (e as { code?: string }).code ||
      (msg.includes("unknown ref") || msg.includes("stale")
        ? "browser_ref_stale"
        : msg.includes("download dir must stay")
          ? "browser_download_denied"
          : msg.includes("navigate") && msg.includes("scheme")
            ? "browser_navigate_denied"
            : msg.includes("no guest") ||
                msg.includes("no bound") ||
                msg.includes("unknown target")
              ? "browser_route_unavailable"
              : msg.includes("requires") ||
                  msg.includes("timed out") ||
                  msg.includes("download") ||
                  msg.includes("dialog")
                ? "browser_engine_failed"
                : "browser_engine_failed");
    const clientMsg =
      code === "invalid_args" ||
      msg.includes("unknown ref") ||
      msg.includes("stale") ||
      msg.includes("requires") ||
      msg.includes("timed out") ||
      msg.includes("download") ||
      msg.includes("dialog") ||
      msg.includes("no guest") ||
      msg.includes("no bound") ||
      msg.includes("scheme")
        ? msg
        : "browser engine failed";
    const status =
      code === "invalid_args"
        ? 400
        : code === "browser_route_unavailable"
          ? 200
          : 500;
    this.send(res, status, {
      ok: false,
      error: clientMsg,
      error_code: code,
    });
  }

  private async dispatch(
    path: string,
    body: Record<string, unknown>,
    res: ServerResponse,
  ): Promise<void> {
    try {
      if (path === "/v1/prepare") {
        const sessions = this.listSessions();
        this.send(res, 200, {
          ok: true,
          backend: "embedded",
          partition: "persist:atmos-browser",
          sessions,
          capabilities: [
            "prepare",
            "state",
            "click",
            "type",
            "navigate",
            "pointer",
            "dialog",
            "download",
            "press-key",
            "end",
            "tabs",
          ],
          note:
            sessions.length === 0
              ? "Optional probe. Empty `state` / `tabs open` will ensure the user's default Browser surface."
              : "Embedded browser sessions ready (no user-Chrome prepare).",
        });
        return;
      }

      if (path === "/v1/state") {
        let targetId =
          typeof body.target_id === "string" ? body.target_id.trim() : "";
        const query =
          typeof body.query === "string" && body.query.trim()
            ? body.query.trim()
            : undefined;
        const includeScreenshot = body.include_screenshot === true;
        if (
          typeof body.snapshot_format === "string" &&
          body.snapshot_format.trim() &&
          body.snapshot_format.trim() !== "embedded_dom_v1" &&
          body.snapshot_format.trim() !== "dom_refs_v1"
        ) {
          this.send(res, 400, {
            ok: false,
            error: `embedded snapshot format ${body.snapshot_format} is unsupported (use embedded_dom_v1)`,
            error_code: "browser_unsupported",
          });
          return;
        }
        if (!targetId) {
          const sessions = this.listSessions();
          const bound = sessions.filter((s) => s.bound);
          const lastActive = this.manager.lastActiveBoundSessionId();
          if (lastActive) {
            targetId = lastActive;
          } else if (bound.length === 1 && bound[0]?.target_id) {
            targetId = bound[0].target_id;
          } else if (bound.length > 1) {
            this.send(res, 200, {
              ok: false,
              sessions,
              error: "multiple embedded browser sessions are open; pass --target-id",
              error_code: "browser_ambiguous_target",
            });
            return;
          } else if (sessions.length > 0) {
            this.send(res, 200, {
              ok: false,
              sessions,
              error:
                "Browser chrome exists but no webview is bound yet; retry state",
              error_code: "browser_route_unavailable",
            });
            return;
          } else {
            const requestedUrl =
              typeof body.url === "string" && body.url.trim()
                ? body.url.trim()
                : undefined;
            const ack = await this.ensureBoundTarget(requestedUrl);
            if (!ack.ok || !ack.target_id) {
              this.send(res, 200, {
                ok: false,
                sessions,
                error:
                  ack.error ||
                  "no bound Atmos Browser webview; open a Browser tab first",
                error_code: ack.error_code || "browser_route_unavailable",
              });
              return;
            }
            targetId = ack.target_id;
            const guest = await this.waitForGuestNavigated(targetId, {
              expectedUrl: requestedUrl,
              requireNonBlank: true,
            });
            if (!guest) {
              this.send(res, 200, {
                ok: false,
                sessions: this.listSessions(),
                error:
                  "Browser chrome opened but the webview is not ready; retry state",
                error_code: "browser_route_unavailable",
              });
              return;
            }
          }
        }
        const guest = await this.waitForGuestReady(targetId);
        if (!guest) {
          this.send(res, 200, {
            ok: false,
            sessions: this.listSessions(),
            error: `no bound webview guest for target_id=${targetId}; retry state`,
            error_code: "browser_route_unavailable",
          });
          return;
        }
        await this.respondSnapshot(res, targetId, query, includeScreenshot);
        return;
      }

      if (path === "/v1/click") {
        const targetId = String(body.target_id || "").trim();
        const ref =
          typeof body.ref === "string" && body.ref.trim()
            ? body.ref.trim()
            : null;
        const x = typeof body.x === "number" ? body.x : null;
        const y = typeof body.y === "number" ? body.y : null;
        if (!targetId) {
          this.send(res, 400, {
            ok: false,
            error: "click requires target_id",
            error_code: "invalid_args",
          });
          return;
        }
        if (!ref && (x == null || y == null)) {
          this.send(res, 400, {
            ok: false,
            error: "click requires ref or both x and y",
            error_code: "invalid_args",
          });
          return;
        }
        const pt = await this.clickRef(targetId, ref, x, y);
        this.send(res, 200, {
          ok: true,
          target_id: targetId,
          ref: pt.ref,
          x: pt.x,
          y: pt.y,
          hit: pt.hit ?? null,
        });
        return;
      }

      if (path === "/v1/type") {
        const targetId = String(body.target_id || "").trim();
        const text = String(body.text ?? "");
        const ref =
          typeof body.ref === "string" && body.ref.trim()
            ? body.ref.trim()
            : null;
        if (!targetId) {
          this.send(res, 400, {
            ok: false,
            error: "type requires target_id",
            error_code: "invalid_args",
          });
          return;
        }
        await this.typeRef(targetId, ref, text, {
          replace: body.replace === true,
          mode: typeof body.mode === "string" ? body.mode : undefined,
        });
        this.send(res, 200, {
          ok: true,
          target_id: targetId,
          ref,
          typed: text.length,
        });
        return;
      }

      if (path === "/v1/navigate") {
        const targetId = String(body.target_id || "").trim();
        const navUrl = String(body.url || "").trim();
        if (!targetId || !navUrl) {
          this.send(res, 400, {
            ok: false,
            error: "navigate requires target_id and url",
            error_code: "invalid_args",
          });
          return;
        }
        if (!isAllowedNavigateUrl(navUrl)) {
          this.send(res, 400, {
            ok: false,
            error: "navigate scheme must be http, https, or about:blank",
            error_code: "browser_navigate_denied",
          });
          return;
        }
        this.markActivity(targetId, "Navigating");
        if (!this.manager.isDetached(targetId)) {
          const ack = await this.requestAgentTab({
            action: "navigate",
            targetId,
            url: navUrl,
          });
          if (!ack.ok) {
            this.send(res, 200, {
              ok: false,
              error: ack.error || "in-panel navigate was not handled",
              error_code: ack.error_code || "browser_route_unavailable",
            });
            return;
          }
          this.invalidateSession(targetId);
          this.send(res, 200, { ok: true, target_id: targetId, url: navUrl });
          return;
        }
        const guest = this.guestFor(targetId);
        if (guest) {
          await guest.loadURL(navUrl);
        } else {
          this.manager.navigate(targetId, navUrl);
        }
        this.invalidateSession(targetId);
        this.send(res, 200, { ok: true, target_id: targetId, url: navUrl });
        return;
      }

      if (path === "/v1/pointer") {
        const targetId = String(body.target_id || "").trim();
        if (!targetId) {
          this.send(res, 400, {
            ok: false,
            error: "pointer requires target_id",
            error_code: "invalid_args",
          });
          return;
        }
        const result = await this.pointerAction(targetId, body);
        this.send(res, 200, { ok: true, target_id: targetId, ...result });
        return;
      }

      if (path === "/v1/dialog") {
        const targetId = String(body.target_id || "").trim();
        if (!targetId) {
          this.send(res, 400, {
            ok: false,
            error: "dialog requires target_id",
            error_code: "invalid_args",
          });
          return;
        }
        const result = await this.dialogAction(targetId, body);
        this.send(res, 200, { ok: true, target_id: targetId, ...result });
        return;
      }

      if (path === "/v1/download") {
        const targetId = String(body.target_id || "").trim();
        const ref = String(body.ref || "").trim();
        const dir =
          typeof body.dir === "string" && body.dir.trim()
            ? body.dir.trim()
            : undefined;
        if (!targetId || !ref) {
          this.send(res, 400, {
            ok: false,
            error: "download requires target_id and ref",
            error_code: "invalid_args",
          });
          return;
        }
        const result = await this.downloadViaRef(targetId, ref, dir);
        this.send(res, 200, { ok: true, target_id: targetId, ...result });
        return;
      }

      if (path === "/v1/press-key") {
        const targetId = String(body.target_id || "").trim();
        const key = String(body.key || "").trim();
        const ref =
          typeof body.ref === "string" && body.ref.trim()
            ? body.ref.trim()
            : null;
        if (!targetId || !key) {
          this.send(res, 400, {
            ok: false,
            error: "press-key requires target_id and key",
            error_code: "invalid_args",
          });
          return;
        }
        const result = await this.pressKey(targetId, key, ref);
        this.send(res, 200, { ok: true, target_id: targetId, ...result });
        return;
      }

      if (path === "/v1/end") {
        const targetId = String(body.target_id || "").trim();
        if (targetId) {
          this.invalidateSession(targetId, {
            releaseDialog: true,
            dropQueue: true,
          });
        }
        this.send(res, 200, { ok: true, ended: true, target_id: targetId || null });
        return;
      }

      if (path === "/v1/tabs") {
        const action = String(body.action || "").trim();
        const targetId =
          typeof body.target_id === "string" ? body.target_id.trim() : "";
        if (action === "list") {
          this.send(res, 200, {
            ok: true,
            action: "list",
            sessions: this.listSessions(),
          });
          return;
        }
        if (action === "open") {
          const navUrl = String(body.url || "").trim();
          if (!navUrl) {
            this.send(res, 400, {
              ok: false,
              error: "tabs open requires url",
              error_code: "invalid_args",
            });
            return;
          }
          if (!isAllowedNavigateUrl(navUrl)) {
            this.send(res, 400, {
              ok: false,
              error: "navigate scheme must be http, https, or about:blank",
              error_code: "browser_navigate_denied",
            });
            return;
          }
          const sessions = this.listSessions();
          const actionName =
            !targetId && sessions.length === 0 ? "ensure-bind" : "open";
          const ack = await this.requestAgentTab({
            action: actionName,
            url: navUrl,
            targetId: targetId || undefined,
          });
          if (ack.ok && ack.target_id) {
            const guest = await this.waitForGuestNavigated(ack.target_id, {
              expectedUrl: navUrl,
              requireNonBlank: true,
            });
            if (!guest) {
              this.send(res, 200, {
                ok: false,
                action: "open",
                target_id: ack.target_id,
                tab_id: ack.tab_id ?? "main",
                url: navUrl,
                evicted_target_ids: ack.evicted_target_ids ?? [],
                error: "tab opened but the page is still loading; retry state",
                error_code: "browser_route_unavailable",
              });
              return;
            }
          }
          this.send(res, ack.ok ? 200 : 400, {
            ok: ack.ok,
            action: "open",
            target_id: ack.target_id ?? null,
            tab_id: ack.tab_id ?? "main",
            url: navUrl,
            evicted_target_ids: ack.evicted_target_ids ?? [],
            error: ack.error,
            error_code: ack.error_code,
          });
          return;
        }
        if (action === "close" || action === "select") {
          if (!targetId) {
            this.send(res, 400, {
              ok: false,
              error: `tabs ${action} requires target_id`,
              error_code: "invalid_args",
            });
            return;
          }
          const ack = await this.requestAgentTab({
            action,
            targetId,
          });
          if (ack.ok && action === "close") {
            this.invalidateSession(targetId, {
              releaseDialog: true,
              dropQueue: true,
            });
            this.manager.clearLastActiveIf(targetId);
          }
          if (ack.ok && action === "select") {
            this.manager.markLastActiveSession(targetId);
          }
          this.send(res, ack.ok ? 200 : 400, {
            ok: ack.ok,
            action,
            target_id: ack.target_id ?? targetId,
            tab_id: ack.tab_id ?? "main",
            error: ack.error,
            error_code: ack.error_code,
          });
          return;
        }
        this.send(res, 400, {
          ok: false,
          error: "tabs requires action list|open|close|select",
          error_code: "invalid_args",
        });
        return;
      }

      this.send(res, 404, {
        ok: false,
        error: "not found",
        error_code: "invalid_args",
      });
    } catch (e) {
      this.sendFailure(res, e);
    }
  }
}
