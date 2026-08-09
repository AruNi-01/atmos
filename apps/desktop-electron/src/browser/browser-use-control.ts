/**
 * Atmos Browser Use — host control plane for APP-053 embedded webviews.
 *
 * Exposes loopback HTTP for `atmos browser-use --backend embedded`.
 * Uses guest WebContents debugger / executeJavaScript (not user-Chrome prepare).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { Debugger, DownloadItem, WebContents } from "electron";
import type { BrowserSurfaceManager } from "./surface-manager.js";
import {
  mapGuestRectToScreen,
  showEmbeddedBrowserChrome,
} from "./browser-use-chrome.js";

// Re-export chrome helpers for existing callers.
export { mapGuestRectToScreen, showEmbeddedBrowserChrome } from "./browser-use-chrome.js";

const CONTROL_DIR = () =>
  process.env.ATMOS_BROWSER_USE_HOME?.trim() ||
  join(homedir(), ".atmos", "browser-use");


type SnapshotEl = {
  ref: string;
  tag: string;
  role: string | null;
  name: string;
  href?: string | null;
  value?: string | null;
  rect: { x: number; y: number; width: number; height: number };
};

type SessionCache = {
  elements: SnapshotEl[];
  url: string;
  title: string;
};

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
  private readonly manager: BrowserSurfaceManager;
  private readonly snapshots = new Map<string, SessionCache>();
  /** Latest JS dialog per guest session (CDP Page.javascriptDialogOpening). */
  private readonly pendingDialogs = new Map<string, PendingDialog>();
  /** Sessions with a long-lived debugger attach for dialog events. */
  private readonly dialogCdpSessions = new Set<string>();
  private dialogSeq = 0;

  constructor(manager: BrowserSurfaceManager) {
    this.manager = manager;
  }

  start(): { baseUrl: string; port: number } {
    if (this.server) {
      return { baseUrl: `http://127.0.0.1:${this.port}`, port: this.port };
    }
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
    mkdirSync(dir, { recursive: true });
    const payload = {
      base_url: `http://127.0.0.1:${this.port}`,
      port: this.port,
      partition: "persist:atmos-browser",
      protocol: "atmos-browser-use/v1",
      updated_at: new Date().toISOString(),
    };
    writeFileSync(join(dir, "control.json"), JSON.stringify(payload, null, 2));
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const c of req) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
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
  }> {
    return this.manager.listBrowserUseSessions();
  }

  private async snapshot(sessionId: string): Promise<SessionCache> {
    const guest = this.guestFor(sessionId);
    if (!guest) {
      throw new Error(
        `no bound webview guest for target_id=${sessionId}; open Atmos Browser tab first`,
      );
    }
    const script = `(() => {
      const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
      const nodes = Array.from(document.querySelectorAll(selectors)).slice(0, 250);
      return {
        url: location.href,
        title: document.title || '',
        elements: nodes.map((el, i) => {
          const r = el.getBoundingClientRect();
          const name =
            (el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              el.getAttribute('name') ||
              (el.innerText || '').trim() ||
              el.getAttribute('href') ||
              '').slice(0, 120);
          return {
            ref: 'e' + i,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            name,
            href: el.getAttribute('href'),
            // Never surface password field values in Browser Use snapshots.
            value:
              el instanceof HTMLInputElement && el.type === 'password'
                ? null
                : el.value != null
                  ? String(el.value).slice(0, 200)
                  : null,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
      };
    })()`;
    const raw = (await guest.executeJavaScript(script, true)) as {
      url: string;
      title: string;
      elements: SnapshotEl[];
    };
    const cache: SessionCache = {
      url: raw?.url ?? guest.getURL(),
      title: raw?.title ?? guest.getTitle(),
      elements: Array.isArray(raw?.elements) ? raw.elements : [],
    };
    this.snapshots.set(sessionId, cache);
    return cache;
  }

  /** Best-effort Desktop Use chrome for embedded spatial actions. */
  private showChromeForRef(
    sessionId: string,
    el: SnapshotEl,
    status: string,
  ): void {
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
      const cache =
        this.snapshots.get(sessionId) ?? (await this.snapshot(sessionId));
      const el = cache.elements.find((e) => e.ref === ref);
      if (!el) throw new Error(`unknown ref ${ref}; run state snapshot first`);
      this.showChromeForRef(sessionId, el, status);
      return {
        x: el.rect.x + Math.max(1, el.rect.width / 2),
        y: el.rect.y + Math.max(1, el.rect.height / 2),
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
    x: number,
    y: number,
    opts?: { button?: "left" | "right" | "middle"; clickCount?: number },
  ): Promise<void> {
    const button = opts?.button ?? "left";
    const clickCount = opts?.clickCount ?? 1;
    await this.withDebugger(guest, null, async (dbg) => {
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

  private async clickRef(
    sessionId: string,
    ref: string | null | undefined,
    x?: number | null,
    y?: number | null,
  ): Promise<{ ref: string | null; x: number; y: number }> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const pt = await this.resolvePoint(sessionId, ref, x, y, "Clicking page");
    try {
      await this.dispatchClick(guest, pt.x, pt.y, {
        button: "left",
        clickCount: 1,
      });
      return pt;
    } catch {
      /* fall through to DOM click when ref known */
    }
    if (!pt.ref) throw new Error("CDP click failed and no ref for DOM fallback");
    const idx = Number(String(pt.ref).replace(/^e/, ""));
    await guest.executeJavaScript(
      `(() => {
        const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
        const nodes = Array.from(document.querySelectorAll(selectors));
        const el = nodes[${Number.isFinite(idx) ? idx : -1}];
        if (!el) throw new Error('ref not found');
        el.focus?.();
        el.click?.();
        return true;
      })()`,
      true,
    );
    return pt;
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
      const cache =
        this.snapshots.get(sessionId) ?? (await this.snapshot(sessionId));
      const el = cache.elements.find((e) => e.ref === ref);
      if (!el) throw new Error(`unknown ref ${ref}; run state snapshot first`);
      this.showChromeForRef(sessionId, el, "Typing in page");
      const idx = Number(String(ref).replace(/^e/, ""));
      // Focus + optional replace via DOM, then prefer CDP insertText for durability.
      await guest.executeJavaScript(
        `(() => {
          const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
          const nodes = Array.from(document.querySelectorAll(selectors));
          const el = nodes[${Number.isFinite(idx) ? idx : -1}];
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
          const selectors = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
          const nodes = Array.from(document.querySelectorAll(selectors));
          const el = nodes[${Number.isFinite(idx) ? idx : -1}];
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
      await this.dispatchClick(guest, pt.x, pt.y, {
        button: "right",
        clickCount: 1,
      });
      return { action, ...pt };
    }

    // double_click
    await this.dispatchClick(guest, pt.x, pt.y, {
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

  private async downloadViaRef(
    sessionId: string,
    ref: string,
    dir: string,
  ): Promise<Record<string, unknown>> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    mkdirSync(dir, { recursive: true });

    const savePromise = new Promise<{
      path: string;
      filename: string;
      state: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("download timed out (30s)"));
      }, 30_000);
      const onWillDownload = (_event: unknown, item: DownloadItem) => {
        const filename = item.getFilename() || "download.bin";
        const savePath = join(dir, basename(filename));
        item.setSavePath(savePath);
        item.once("done", (_e, state) => {
          cleanup();
          if (state === "completed") {
            resolve({ path: savePath, filename, state });
          } else {
            reject(new Error(`download ${state}`));
          }
        });
      };
      const cleanup = () => {
        clearTimeout(timer);
        try {
          guest.session.removeListener("will-download", onWillDownload);
        } catch {
          /* ignore */
        }
      };
      guest.session.once("will-download", onWillDownload);
    });

    // Trigger download by clicking the ref (link / button).
    await this.clickRef(sessionId, ref);
    const result = await savePromise;
    return {
      ok: true,
      ref,
      dir,
      ...result,
    };
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
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
          ],
        });
        return;
      }
      if (req.method !== "POST") {
        this.send(res, 405, { ok: false, error: "method not allowed" });
        return;
      }
      const body = await this.readBody(req);
      const path = url.pathname;

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
          ],
          note:
            sessions.length === 0
              ? "No open Atmos Browser webviews. Open a Browser tab in Desktop first."
              : "Embedded browser sessions ready (no user-Chrome prepare).",
        });
        return;
      }

      if (path === "/v1/state") {
        const targetId =
          typeof body.target_id === "string" ? body.target_id.trim() : "";
        if (!targetId) {
          const sessions = this.listSessions();
          this.send(res, 200, {
            ok: true,
            mode: "bind",
            sessions,
            // Convenience: first bound session as default target
            target_id: sessions.find((s) => s.bound)?.target_id ?? null,
            tab_id: "main",
          });
          return;
        }
        const snap = await this.snapshot(targetId);
        // Best-effort: arm dialog listener while inspecting the tab.
        const guest = this.guestFor(targetId);
        if (guest) {
          try {
            await this.armDialogListener(targetId, guest);
          } catch {
            /* optional */
          }
        }
        this.send(res, 200, {
          ok: true,
          mode: "snapshot",
          target_id: targetId,
          tab_id: "main",
          url: snap.url,
          title: snap.title,
          elements: snap.elements,
          element_count: snap.elements.length,
          pending_dialog: this.pendingDialogs.get(targetId) ?? null,
        });
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
        // Host-owned navigation for detached / bookkeeping; guest loadURL when bound.
        const guest = this.guestFor(targetId);
        if (guest) {
          await guest.loadURL(navUrl);
        } else {
          this.manager.navigate(targetId, navUrl);
        }
        // Page document changed — drop stale element refs/coords.
        this.snapshots.delete(targetId);
        this.pendingDialogs.delete(targetId);
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
        const dir = String(body.dir || "").trim();
        if (!targetId || !ref || !dir) {
          this.send(res, 400, {
            ok: false,
            error: "download requires target_id, ref, and dir",
            error_code: "invalid_args",
          });
          return;
        }
        const result = await this.downloadViaRef(targetId, ref, dir);
        this.send(res, 200, { ok: true, target_id: targetId, ...result });
        return;
      }

      this.send(res, 404, { ok: false, error: "not found" });
    } catch (e) {
      // Log full error server-side only — never put Error/stack on the wire
      // (CodeQL js/stack-trace-exposure). Clients get a stable generic message.
      console.error("[browser-use] control plane request failed:", e);
      const msg = e instanceof Error ? e.message : "browser engine failed";
      // Safe subset of client-facing errors (no stacks).
      const clientMsg =
        msg.includes("unknown ref") ||
        msg.includes("requires") ||
        msg.includes("timed out") ||
        msg.includes("download") ||
        msg.includes("dialog") ||
        msg.includes("no guest") ||
        msg.includes("no bound")
          ? msg
          : "browser engine failed";
      this.send(res, 500, {
        ok: false,
        error: clientMsg,
        error_code: "browser_engine_failed",
      });
    }
  }
}
