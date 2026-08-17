import { resolve } from "node:path";
import { defaultLiveHttpUrl, DEFAULT_LIVE_PORT, isLiveEvent, LIVE_PROTOCOL, type LiveEvent } from "./protocol";
import { attachLiveWatch, liveHubHealthy } from "./publish";
import { watchDesignFile } from "./watch";

export type LiveHub = {
  url: string;
  port: number;
  stop: () => void;
};

type Socket = {
  send: (data: string) => void;
  readyState: number;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS });
}

export async function startLiveHub(
  port?: number,
  options: { file?: string } = {},
): Promise<LiveHub> {
  const bind = port ?? Number(process.env.PT_DESIGN_LIVE_PORT ?? DEFAULT_LIVE_PORT);
  const clients = new Set<Socket>();
  const watchers = new Map<string, () => void>();
  let last: LiveEvent | null = null;

  const broadcast = (event: LiveEvent) => {
    last = event;
    const payload = JSON.stringify(event);
    for (const client of clients) {
      try {
        client.send(payload);
      } catch {
        clients.delete(client);
      }
    }
  };

  const startWatching = (file: string) => {
    const abs = resolve(file);
    if (watchers.has(abs)) return abs;
    watchers.set(
      abs,
      watchDesignFile(abs, (event) => {
        broadcast(event);
      }),
    );
    return abs;
  };

  type LiveServer = {
    serve: (opts: {
      port: number;
      hostname: string;
      fetch: (
        req: Request,
        srv: { upgrade: (req: Request, opts?: { data?: { role: string } }) => boolean },
      ) => Response | Promise<Response>;
      websocket: {
        open: (ws: Socket) => void;
        close: (ws: Socket) => void;
        message: () => void;
      };
    }) => { port: number; stop: (force?: boolean) => void };
  };
  const bun = (globalThis as { Bun?: LiveServer }).Bun;
  if (!bun) throw new Error("PT Design live hub requires Bun");

  const server = bun.serve({
    port: bind,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      const path = new URL(req.url).pathname;
      if (path === "/ws") {
        if (srv.upgrade(req, { data: { role: "live" } })) return new Response();
        return new Response("upgrade failed", { status: 400, headers: CORS });
      }
      if (path === "/health") {
        return json({
          ok: true,
          v: LIVE_PROTOCOL,
          clients: clients.size,
          watching: [...watchers.keys()],
        });
      }
      if (path === "/event" && req.method === "POST") {
        return req.json().then((body: unknown) => {
          if (!isLiveEvent(body)) return json({ ok: false }, 400);
          broadcast(body);
          return json({ ok: true });
        });
      }
      if (path === "/watch" && req.method === "POST") {
        return req.json().then((body: unknown) => {
          const file =
            body && typeof body === "object" && typeof (body as { file?: unknown }).file === "string"
              ? (body as { file: string }).file
              : "";
          if (!file) return json({ ok: false }, 400);
          return json({ ok: true, file: startWatching(file) });
        });
      }
      if (path === "/scene") {
        return json({ scene: last?.scene ?? null });
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
      }
      return new Response("not found", { status: 404, headers: CORS });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        if (last) ws.send(JSON.stringify(last));
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {},
    },
  });

  if (options.file) startWatching(options.file);

  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port,
    stop: () => {
      for (const unsub of watchers.values()) unsub();
      watchers.clear();
      server.stop(true);
    },
  };
}

export async function ensureLiveHub(options: { file?: string } = {}): Promise<string> {
  const url = defaultLiveHttpUrl();
  if (await liveHubHealthy(url)) {
    if (options.file) await attachLiveWatch(options.file, url);
    return url;
  }
  try {
    const hub = await startLiveHub(undefined, options);
    return hub.url;
  } catch {
    if (await liveHubHealthy(url)) {
      if (options.file) await attachLiveWatch(options.file, url);
      return url;
    }
    throw new Error(`Could not start PT Design live hub at ${url}`);
  }
}
