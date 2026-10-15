/**
 * Screenshot the parity preview as react-native-web.
 * These PNGs are not iOS Simulator frames and not Next.js frames.
 * S31 stays not_run until a real Next capture exists.
 *
 * Run from the repo root after `expo export --platform web`:
 *   RN_WEB_DIST=artifacts/rn-web-dist RN_WEB_OUT=artifacts/rn-web \
 *     bun scripts/agent-chat-parity/rn-web-capture.ts
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { PARITY_FIXTURE_IDS } from "../../packages/agent-transcript/src/index.ts";

const DIST = resolve(process.env.RN_WEB_DIST ?? "artifacts/rn-web-dist");
const OUT = resolve(process.env.RN_WEB_OUT ?? "artifacts/rn-web");
const THEMES = ["light", "dark"] as const;

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

class Cdp {
  private next = 0;
  private pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  private listeners: Array<(message: CdpMessage) => void> = [];
  private socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  open(): Promise<void> {
    return new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener("open", () => resolveOpen());
      this.socket.addEventListener("error", () => rejectOpen(new Error("chrome socket failed")));
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as CdpMessage;
        if (message.id != null && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending?.reject(new Error(message.error.message ?? "cdp error"));
          else pending?.resolve(message.result ?? {});
          return;
        }
        for (const listener of this.listeners) listener(message);
      });
    });
  }

  on(listener: (message: CdpMessage) => void): void {
    this.listeners.push(listener);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.next;
    const result = new Promise<Record<string, unknown>>((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close(): void {
    this.socket.close();
  }
}

function chromeBinary(): string {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync("/opt/google/chrome/chrome")) return "/opt/google/chrome/chrome";
  return "google-chrome";
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    default:
      return "application/octet-stream";
  }
}

async function sendFile(response: ServerResponse, path: string): Promise<boolean> {
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": contentType(path) });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

function serve(root: string): Promise<{ origin: string; close: () => void }> {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      const file = join(root, relative);
      if (!file.startsWith(root)) {
        response.writeHead(400);
        response.end();
        return;
      }
      if (await sendFile(response, file)) return;
      if (await sendFile(response, join(file, "index.html"))) return;
      if (await sendFile(response, join(root, "index.html"))) return;
      response.writeHead(404);
      response.end();
    })();
  });
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("static server has no port"));
        return;
      }
      resolveListen({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}

function consoleText(params: Record<string, unknown> | undefined): string {
  const args = params?.args;
  if (!Array.isArray(args)) return "";
  return args
    .map((arg) => {
      if (!arg || typeof arg !== "object") return "";
      const record = arg as { value?: unknown; description?: unknown };
      if (typeof record.value === "string") return record.value;
      if (typeof record.description === "string") return record.description;
      return "";
    })
    .join(" ");
}

async function waitForReady(cdp: Cdp, needle: string, timeoutMs: number): Promise<void> {
  const lines: string[] = [];
  let pending: (() => void) | null = null;
  const onMessage = (message: CdpMessage) => {
    if (message.method === "Runtime.exceptionThrown") {
      lines.push(`exception ${JSON.stringify(message.params)}`);
      pending?.();
    }
    if (message.method === "Runtime.consoleAPICalled") {
      lines.push(consoleText(message.params));
      pending?.();
    }
  };
  cdp.on(onMessage);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (lines.some((line) => line.includes(needle))) return;
    if (lines.some((line) => line.startsWith("exception "))) {
      throw new Error(lines.filter((line) => line.startsWith("exception ")).join("\n"));
    }
    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(resolveWait, 200);
      pending = () => {
        clearTimeout(timer);
        resolveWait();
      };
    });
    pending = null;
  }
  throw new Error(`timed out waiting for ${needle}\n${lines.slice(-30).join("\n")}`);
}

async function main(): Promise<void> {
  const indexHtml = join(DIST, "index.html");
  if (!existsSync(indexHtml)) {
    throw new Error(`missing ${indexHtml}. Export with EXPO_PUBLIC_PARITY_PREVIEW=1 first.`);
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(
    join(OUT, "README.txt"),
    [
      "react-native-web screenshots of the parity preview (Expo web export).",
      "Not iOS Simulator frames. Not Next.js / apps/web frames.",
      "S31 stays not_run.",
      "",
    ].join("\n"),
  );

  const site = await serve(DIST);
  const port = 9222;
  const profile = join(tmpdir(), `parity-chrome-${process.pid}`);
  const chrome = spawn(
    chromeBinary(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let page: Cdp | null = null;
  try {
    let version: { webSocketDebuggerUrl?: string } | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          version = (await response.json()) as { webSocketDebuggerUrl?: string };
          break;
        }
      } catch {
        // Chrome is still starting.
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
    }
    if (!version?.webSocketDebuggerUrl) throw new Error("chrome devtools did not open");

    const browser = new Cdp(version.webSocketDebuggerUrl);
    await browser.open();
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const targetId = String(created.targetId ?? "");
    let pageUrl = "";
    for (let attempt = 0; attempt < 20 && !pageUrl; attempt += 1) {
      const list = (await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json(),
      )) as Array<{ id?: string; webSocketDebuggerUrl?: string }>;
      pageUrl = list.find((item) => item.id === targetId)?.webSocketDebuggerUrl ?? "";
      if (!pageUrl) await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
    }
    browser.close();
    if (!pageUrl) throw new Error("chrome page socket missing");

    page = new Cdp(pageUrl);
    await page.open();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    let first = true;
    for (const theme of THEMES) {
      for (const id of PARITY_FIXTURE_IDS) {
        const needle = `[parity] ready ${id} ${theme}`;
        const ready = waitForReady(page, needle, first ? 90_000 : 45_000);
        first = false;
        await page.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-color-scheme", value: theme }],
        });
        await page.send("Page.navigate", {
          url: `${site.origin}/preview-chat?fixture=${encodeURIComponent(id)}&theme=${theme}`,
        });
        await ready;
        const shot = await page.send("Page.captureScreenshot", { format: "png" });
        const data = shot.data;
        if (typeof data !== "string" || data.length === 0) {
          throw new Error(`empty screenshot for ${id} ${theme}`);
        }
        await writeFile(join(OUT, `${id}-${theme}.png`), Buffer.from(data, "base64"));
        console.log(`wrote ${id}-${theme}.png`);
      }
    }
  } finally {
    page?.close();
    site.close();
    chrome.kill("SIGTERM");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
