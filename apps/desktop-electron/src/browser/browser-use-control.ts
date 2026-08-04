/**
 * Atmos Browser Use — host control plane for APP-053 embedded webviews.
 *
 * Exposes loopback HTTP for `atmos browser-use --backend embedded`.
 * Uses guest WebContents debugger / executeJavaScript (not user-Chrome prepare).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";
import type { BrowserSurfaceManager } from "./surface-manager.js";

const CONTROL_DIR = () =>
  process.env.ATMOS_BROWSER_USE_HOME?.trim() ||
  join(homedir(), ".atmos", "browser-use");

/** Session id shared with Rust browser-use chrome (Desktop Use cursor palette). */
const BROWSER_USE_CHROME_SESSION = "atmos-browser-use";

/**
 * Map guest-local element rect → approximate screen (logical) coords using the
 * host BrowserWindow content origin. Best-effort: webview offset inside the
 * page is not measured (may be slightly off; click path stays CDP/DOM).
 */
export function mapGuestRectToScreen(
  hostContent: { x: number; y: number; width: number; height: number },
  rect: { x: number; y: number; width: number; height: number },
): {
  cursor: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
} {
  const x = hostContent.x + rect.x;
  const y = hostContent.y + rect.y;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    cursor: { x: x + width / 2, y: y + height / 2 },
    bounds: { x, y, width, height },
  };
}

/**
 * Spawn detached without risking Electron main uncaughtException on ENOENT
 * (missing ATMOS_CLI / ~/.atmos/bin/atmos). Mirrors control-plane listen hardening.
 */
function spawnDetachedQuiet(command: string, args: string[]): void {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      // Missing binary, EACCES, etc. — never crash the main process.
      console.warn(
        `[browser-use] chrome spawn failed cmd=${command}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    child.unref();
  } catch (err) {
    console.warn(
      `[browser-use] chrome spawn threw cmd=${command}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fire-and-forget Desktop Use chrome (operation border + agent cursor).
 * Reuses `atmos desktop-use drive highlight|move` — same overlay stack as Desktop Use.
 * Never throws; missing CLI only logs a warning (does not crash main).
 */
export function showEmbeddedBrowserChrome(opts: {
  status: string;
  cursor: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  session?: string;
}): void {
  const atmos =
    process.env.ATMOS_CLI?.trim() ||
    join(homedir(), ".atmos", "bin", "atmos");
  const session = opts.session?.trim() || BROWSER_USE_CHROME_SESSION;
  const b = opts.bounds;
  const c = opts.cursor;
  // Border around the element (or host content when bounds are large).
  spawnDetachedQuiet(atmos, [
    "desktop-use",
    "--json",
    "drive",
    "highlight",
    "--mode",
    "window",
    "--x",
    String(Math.round(b.x)),
    "--y",
    String(Math.round(b.y)),
    "--width",
    String(Math.round(b.width)),
    "--height",
    String(Math.round(b.height)),
    "--status",
    opts.status,
  ]);
  // Agent cursor overlay (not OS pointer steal).
  spawnDetachedQuiet(atmos, [
    "desktop-use",
    "--json",
    "drive",
    "move",
    "--x",
    String(Math.round(c.x)),
    "--y",
    String(Math.round(c.y)),
    "--coord-space",
    "points",
    "--session",
    session,
  ]);
}

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

export class BrowserUseControlPlane {
  private server: Server | null = null;
  private port = 0;
  private readonly manager: BrowserSurfaceManager;
  private readonly snapshots = new Map<string, SessionCache>();

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

  /** Client-safe error text — never include stack traces (CodeQL js/stack-trace-exposure). */
  private publicErrorMessage(e: unknown): string {
    if (e instanceof Error) {
      const msg = typeof e.message === "string" ? e.message.trim() : "";
      return msg ? msg.slice(0, 500) : "browser engine failed";
    }
    if (typeof e === "string") {
      const msg = e.trim();
      return msg ? msg.slice(0, 500) : "browser engine failed";
    }
    return "browser engine failed";
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

  private async clickRef(sessionId: string, ref: string): Promise<void> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    const cache = this.snapshots.get(sessionId) ?? (await this.snapshot(sessionId));
    const el = cache.elements.find((e) => e.ref === ref);
    if (!el) throw new Error(`unknown ref ${ref}; run state snapshot first`);
    this.showChromeForRef(sessionId, el, "Clicking page");
    const x = el.rect.x + Math.max(1, el.rect.width / 2);
    const y = el.rect.y + Math.max(1, el.rect.height / 2);
    // Prefer CDP via debugger when free; fall back to DOM click by index.
    try {
      const dbg = guest.debugger;
      let attachedHere = false;
      try {
        if (!dbg.isAttached()) {
          dbg.attach("1.3");
          attachedHere = true;
        }
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await dbg.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        return;
      } finally {
        // Always detach if we attached — sendCommand failures must not leave
        // the guest debugger stuck (blocks subsequent CDP / double-actions).
        if (attachedHere) {
          try {
            dbg.detach();
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* fall through to DOM click */
    }
    const idx = Number(String(ref).replace(/^e/, ""));
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
  }

  private async typeRef(
    sessionId: string,
    ref: string | null | undefined,
    text: string,
  ): Promise<void> {
    const guest = this.guestFor(sessionId);
    if (!guest) throw new Error(`no guest for ${sessionId}`);
    if (ref) {
      const cache = this.snapshots.get(sessionId) ?? (await this.snapshot(sessionId));
      const el = cache.elements.find((e) => e.ref === ref);
      if (!el) throw new Error(`unknown ref ${ref}; run state snapshot first`);
      this.showChromeForRef(sessionId, el, "Typing in page");
      const idx = Number(String(ref).replace(/^e/, ""));
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
    // Insert into active element
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
        this.send(res, 200, {
          ok: true,
          mode: "snapshot",
          target_id: targetId,
          tab_id: "main",
          url: snap.url,
          title: snap.title,
          elements: snap.elements,
          element_count: snap.elements.length,
        });
        return;
      }

      if (path === "/v1/click") {
        const targetId = String(body.target_id || "").trim();
        const ref = String(body.ref || "").trim();
        if (!targetId || !ref) {
          this.send(res, 400, {
            ok: false,
            error: "click requires target_id and ref",
            error_code: "invalid_args",
          });
          return;
        }
        await this.clickRef(targetId, ref);
        this.send(res, 200, { ok: true, target_id: targetId, ref });
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
        await this.typeRef(targetId, ref, text);
        this.send(res, 200, { ok: true, target_id: targetId, ref, typed: text.length });
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
        this.send(res, 200, { ok: true, target_id: targetId, url: navUrl });
        return;
      }

      this.send(res, 404, { ok: false, error: "not found" });
    } catch (e) {
      // Log full error server-side; response body stays message-only (no stack).
      console.error("[browser-use] control plane request failed:", e);
      this.send(res, 500, {
        ok: false,
        error: this.publicErrorMessage(e),
        error_code: "browser_engine_failed",
      });
    }
  }
}
