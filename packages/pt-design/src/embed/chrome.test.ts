import { describe, expect, test } from "bun:test";
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
