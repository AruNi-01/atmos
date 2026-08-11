/**
 * Shared local tunnel gateway (Tauri parity: 127.0.0.1:30313).
 * Reverse-proxies to Atmos Server with entry_token session validation.
 */

import http from "node:http";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const GATEWAY_PORT = 30313;
export const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;

export type GatewaySession = {
  sessionId: string;
  entryToken: string;
  provider: string;
  mode: string;
  ttlSecs: number;
  createdAt: string;
  expiresAt: string | null;
  publicUrl: string | null;
};

export type GatewayStatusFields = {
  gateway_url: string;
  entry_token: string;
  expires_at: string | null;
  share_url: string | null;
};

export function buildShareUrl(
  publicUrl: string,
  entryToken: string,
): string {
  const sep = publicUrl.includes("?") ? "&" : "?";
  return `${publicUrl}${sep}entry_token=${entryToken}`;
}

export function createGatewaySession(opts: {
  provider: string;
  mode: string;
  ttlSecs: number;
  now?: Date;
}): GatewaySession {
  const now = opts.now ?? new Date();
  const ttl = Math.max(60, opts.ttlSecs || 3600);
  const expires = new Date(now.getTime() + ttl * 1000);
  const entryToken = randomBytes(16).toString("hex");
  return {
    sessionId: randomBytes(8).toString("hex"),
    entryToken,
    provider: opts.provider,
    mode: opts.mode,
    ttlSecs: ttl,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    publicUrl: null,
  };
}

export function statusFieldsForSession(
  session: GatewaySession,
  publicUrl: string | null,
): GatewayStatusFields {
  const url = publicUrl ?? session.publicUrl;
  return {
    gateway_url: GATEWAY_URL,
    entry_token: session.entryToken,
    expires_at: session.expiresAt,
    share_url: url ? buildShareUrl(url, session.entryToken) : null,
  };
}

export class LocalGateway {
  private server: http.Server | null = null;
  private targetBaseUrl: string;
  private sessions = new Map<string, GatewaySession>();

  constructor(targetBaseUrl: string) {
    this.targetBaseUrl = targetBaseUrl.replace(/\/$/, "");
  }

  get localUrl(): string {
    return GATEWAY_URL;
  }

  registerSession(session: GatewaySession): void {
    this.sessions.set(session.entryToken, session);
  }

  revokeSession(entryToken: string): void {
    this.sessions.delete(entryToken);
  }

  setPublicUrl(entryToken: string, publicUrl: string): void {
    const s = this.sessions.get(entryToken);
    if (s) s.publicUrl = publicUrl;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  async start(): Promise<void> {
    if (this.server) return;
    await new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handle(req, res);
      });
      server.once("error", reject);
      server.listen(GATEWAY_PORT, "127.0.0.1", () => {
        this.server = server;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.sessions.clear();
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Force-close hangers
      setTimeout(() => resolve(), 500).unref?.();
    });
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const host = req.headers.host ?? `127.0.0.1:${GATEWAY_PORT}`;
      const url = new URL(req.url ?? "/", `http://${host}`);
      const token =
        url.searchParams.get("entry_token") ||
        (typeof req.headers["x-atmos-entry-token"] === "string"
          ? req.headers["x-atmos-entry-token"]
          : null);

      if (!token || !this.sessions.has(token)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_or_missing_entry_token" }));
        return;
      }
      const session = this.sessions.get(token)!;
      if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "entry_token_expired" }));
        return;
      }

      // Strip entry_token before proxying to local API
      url.searchParams.delete("entry_token");
      const targetPath = `${url.pathname}${url.search}`;
      const targetUrl = `${this.targetBaseUrl}${targetPath}`;

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v == null) continue;
        if (k === "host" || k === "connection") continue;
        headers[k] = Array.isArray(v) ? v.join(",") : v;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method && ["GET", "HEAD"].includes(req.method.toUpperCase())
            ? undefined
            : body,
        // Node fetch may require duplex when body is a stream; Buffer is fine without.
        ...(typeof body !== "undefined"
          ? ({ duplex: "half" } as RequestInit)
          : {}),
      });

      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "transfer-encoding") return;
        outHeaders[key] = value;
      });
      res.writeHead(upstream.status, outHeaders);
      const ab = Buffer.from(await upstream.arrayBuffer());
      res.end(ab);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      res.end(
        JSON.stringify({
          error: "gateway_proxy_failed",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
}
