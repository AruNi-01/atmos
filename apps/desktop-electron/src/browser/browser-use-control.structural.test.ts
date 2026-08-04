import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("browser-use-control structural", () => {
  it("control plane is wired from main boot", () => {
    const main = readFileSync(join(root, "main.ts"), "utf8");
    expect(main).toContain("BrowserUseControlPlane");
    expect(main).toContain("browserUseControl");
  });

  it("exposes guest accessors on surface manager", () => {
    const sm = readFileSync(join(root, "browser/surface-manager.ts"), "utf8");
    expect(sm).toContain("getGuestWebContents");
    expect(sm).toContain("listBrowserUseSessions");
  });

  it("control plane uses loopback + control.json", () => {
    const src = readFileSync(join(root, "browser/browser-use-control.ts"), "utf8");
    expect(src).toContain("127.0.0.1");
    expect(src).toContain("control.json");
    expect(src).toContain("/v1/prepare");
    expect(src).toContain("/v1/state");
    expect(src).toContain("persist:atmos-browser");
  });
});
