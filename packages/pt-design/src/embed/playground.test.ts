import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const playground = join(dirname(fileURLToPath(import.meta.url)), "../../playground");

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
});
