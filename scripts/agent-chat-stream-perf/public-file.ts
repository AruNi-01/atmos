import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export function resolvePublicFile(root: string, requestUrl: string | undefined): string | null {
  const queryCut = (requestUrl ?? "/").split("?")[0] ?? "/";
  let path: string;
  try {
    path = decodeURIComponent(queryCut);
  } catch {
    return null;
  }
  if (path === "/") path = "/index.html";
  if (path !== "/index.html" && path !== "/bench.js") return null;
  const resolved = resolve(root, `.${path}`);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
}

export function serveDist(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolveListen, reject) => {
    const server = createServer(async (req, res) => {
      const file = resolvePublicFile(root, req.url);
      const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
      if (!file || !file.startsWith(prefix)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type": file.endsWith(".js") ? "text/javascript" : "text/html",
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to bind bench server"));
        return;
      }
      resolveListen({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
