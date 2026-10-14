import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePublicFile, serveDist } from "./public-file";

const root = join("/workspace", "scripts", "agent-chat-stream-perf", "dist");

describe("resolvePublicFile", () => {
  it("maps / and /index.html and /bench.js into dist", () => {
    expect(resolvePublicFile(root, "/")).toBe(join(root, "index.html"));
    expect(resolvePublicFile(root, "/index.html")).toBe(join(root, "index.html"));
    expect(resolvePublicFile(root, "/bench.js?mode=branch")).toBe(join(root, "bench.js"));
  });

  it("rejects path traversal and anything outside the whitelist", () => {
    expect(resolvePublicFile(root, "/../run.ts")).toBeNull();
    expect(resolvePublicFile(root, "/..%2frun.ts")).toBeNull();
    expect(resolvePublicFile(root, "/%2e%2e/public-file.ts")).toBeNull();
    expect(resolvePublicFile(root, "/../../package.json")).toBeNull();
    expect(resolvePublicFile(root, "/secret.txt")).toBeNull();
  });
});

describe("serveDist", () => {
  it("returns 403 for traversal and only serves the two public files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-chat-bench-"));
    writeFileSync(join(dir, "index.html"), "<html>ok</html>");
    writeFileSync(join(dir, "bench.js"), "window.__ok=1");
    writeFileSync(join(dir, "secret.txt"), "nope");
    const server = await serveDist(dir);
    const port = Number(new URL(server.url).port);
    const raw = (path: string) =>
      new Promise<{ status: number; body: string }>((resolveReq, reject) => {
        const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolveReq({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
        req.on("error", reject);
        req.end();
      });
    try {
      const allowed = await raw("/index.html");
      expect(allowed.status).toBe(200);
      expect(allowed.body).toContain("ok");
      expect((await raw("/../secret.txt")).status).toBe(403);
      expect((await raw("/%2e%2e/secret.txt")).status).toBe(403);
      expect((await raw("/secret.txt")).status).toBe(403);
    } finally {
      await server.close();
    }
  });
});
