import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";
import { CONTROL_PROTOCOL } from "./control-lease.ts";
import {
  authorizeControlBearer,
  authorizeSessionToken,
  isAllowedUpstreamPath,
  parseProxyPath,
} from "./proxy.ts";

export type ControlInvokeHandler = (body: unknown) => Promise<unknown>;

export type SessionProxyTarget = {
  sessionToken: string;
  helperPort: number;
};

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export class SimulatorControlPlane {
  private server: Server | null = null;
  private port = 0;
  private controlToken = "";
  private lookup: (token: string) => SessionProxyTarget | null = () => null;
  private invoke: ControlInvokeHandler = async () => ({ ok: false });

  async start(opts: {
    lookupSession: (token: string) => SessionProxyTarget | null;
    invoke: ControlInvokeHandler;
  }): Promise<{ port: number; token: string }> {
    if (this.server) {
      return { port: this.port, token: this.controlToken };
    }
    this.lookup = opts.lookupSession;
    this.invoke = opts.invoke;
    this.controlToken = newToken();

    const server = createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    server.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("control plane failed to bind loopback");
    }
    this.port = addr.port;
    this.server = server;
    return { port: this.port, token: this.controlToken };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;
    this.controlToken = "";
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.controlToken;
  }

  private async handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const pathname = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/";
    const parsed = parseProxyPath(pathname);
    if (!parsed) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    if (parsed.kind === "health") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      sendJson(res, 200, { ok: true, protocol: CONTROL_PROTOCOL });
      return;
    }
    if (parsed.kind === "invoke") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!authorizeControlBearer(req.headers.authorization, this.controlToken)) {
        sendJson(res, 403, { ok: false, error: "forbidden" });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const result = await this.invoke(body);
        sendJson(res, 200, result);
      } catch {
        sendJson(res, 500, { ok: false, error: "internal" });
      }
      return;
    }

    const session = this.lookup(parsed.token);
    if (
      !session ||
      !authorizeSessionToken(parsed.token, session.sessionToken)
    ) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    if (!isAllowedUpstreamPath(parsed.upstreamPath)) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    await this.forwardHttp(req, res, session.helperPort, parsed.upstreamPath);
  }

  private async forwardHttp(
    req: IncomingMessage,
    res: ServerResponse,
    helperPort: number,
    upstreamPath: string,
  ): Promise<void> {
    const search = req.url ? new URL(req.url, "http://127.0.0.1").search : "";
    const headers = { ...req.headers };
    delete headers.host;
    const proxyReq = await import("node:http").then(({ request }) =>
      request(
        {
          hostname: "127.0.0.1",
          port: helperPort,
          path: `${upstreamPath}${search}`,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      ),
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) sendJson(res, 502, { ok: false, error: "upstream" });
      else res.end();
    });
    req.pipe(proxyReq);
  }

  private handleUpgrade(
    req: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): void {
    const pathname = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/";
    const parsed = parseProxyPath(pathname);
    if (!parsed || parsed.kind !== "session") {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const session = this.lookup(parsed.token);
    if (
      !session ||
      !authorizeSessionToken(parsed.token, session.sessionToken) ||
      !isAllowedUpstreamPath(parsed.upstreamPath)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = connect(session.helperPort, "127.0.0.1", () => {
      const headers = [`${req.method} ${parsed.upstreamPath} HTTP/1.1`, `Host: 127.0.0.1:${session.helperPort}`];
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined || key.toLowerCase() === "host") continue;
        const v = Array.isArray(value) ? value.join(",") : value;
        headers.push(`${key}: ${v}`);
      }
      headers.push("", "");
      upstream.write(headers.join("\r\n"));
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => {
      try {
        socket.end();
      } catch {
        /* ignore */
      }
    });
    socket.on("error", () => {
      try {
        upstream.end();
      } catch {
        /* ignore */
      }
    });
  }
}
