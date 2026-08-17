import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPlayground } from "../../playground/server";

const playground = join(dirname(fileURLToPath(import.meta.url)), "../../playground");

describe("package README entry points", () => {
  test("documents that MCP is stdio and not the playground server", () => {
    const readme = readFileSync(join(playground, "../README.md"), "utf8");
    expect(readme).toContain("pt-design-mcp");
    expect(readme).toContain("stdin/stdout");
    expect(readme).toContain("not Vite");
    expect(readme).toContain("@modelcontextprotocol/sdk");
    expect(readme).toContain("Starting the playground does **not** start MCP");
    expect(readme).toContain("StdioServerTransport");
    expect(readme).toContain("pt-design-mcp-server");
    expect(readme).toContain("PT_DESIGN_COLLAB_ROOM");
    expect(readme).toContain("does **not** write the open board");
    expect(readme).toContain("collaboration");
    expect(readme).toContain("/api/pt-design/agent/invoke");
    expect(readme).toContain("Opening the tab is enough");
    expect(readme).toContain("npx");
    expect(readme).not.toMatch(/connect(?:s)? to .*4173/);
  });
});

describe("standalone playground", () => {
  test("mounts PtDesignApp from a real host entry", () => {
    const main = readFileSync(join(playground, "main.tsx"), "utf8");
    const server = readFileSync(join(playground, "server.ts"), "utf8");
    expect(main).toContain("PtDesignApp");
    expect(main).toContain("createRoot");
    expect(server).toContain("pt-design-playground");
    expect(server).toContain("main.tsx");
    expect(server).not.toMatch(/console\.log\("PT Design playground: import PtDesignApp/);
  });

  test("serves the real embed without Atmos API", async () => {
    const server = await startPlayground(0);
    try {
      const html = await (await fetch(`http://127.0.0.1:${server.port}/`)).text();
      const js = await (await fetch(`http://127.0.0.1:${server.port}/playground.js`)).text();
      expect(html).toContain("pt-design-playground");
      expect(html).toContain("/excalidraw.css");
      expect(js.includes("PtDesignApp") || js.includes("PT Design")).toBe(true);
      expect(js.toLowerCase()).toContain("excalidraw");
      const css = await (await fetch(`http://127.0.0.1:${server.port}/excalidraw.css`)).text();
      expect(css).toContain(".excalidraw");
      expect(css).toContain(".pt-design-island-trigger");
    } finally {
      server.stop();
    }
  });
});
