import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chromeTokens, resolveBoardTheme } from "./chrome";

describe("embed chrome tokens", () => {
  test("dark tokens never use a light canvas or light fallback foreground", () => {
    const dark = chromeTokens("dark");
    expect(dark.canvas).toBe("#242428");
    expect(dark.fg).toContain("--foreground");
    expect(dark.fg).not.toContain("#18181b");
    expect(dark.bg).not.toContain("#fafafa");
  });

  test("light tokens keep a readable dark foreground fallback", () => {
    const light = chromeTokens("light");
    expect(light.canvas).toBe("#ffffff");
    expect(light.fg).toContain("#18181b");
  });

  test("resolveBoardTheme honors an explicit theme", () => {
    expect(resolveBoardTheme("dark")).toBe("dark");
    expect(resolveBoardTheme("light")).toBe("light");
  });
});

describe("excalidraw dark canvas invert", () => {
  test("board disables Excalidraw's canvas invert so remapped colors stay readable", () => {
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./excalidraw-theme.css", import.meta.url), "utf8");
    expect(board).toContain('import "./excalidraw-theme.css"');
    expect(board).toContain("pt-design-excalidraw-theme");
    expect(board).toContain("DISABLE_CANVAS_INVERT");
    expect(css).toContain(".excalidraw.theme--dark canvas");
    expect(css).toContain("filter: none");
  });
});

