import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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
    expect(src).toContain("/v1/pointer");
    expect(src).toContain("/v1/dialog");
    expect(src).toContain("/v1/download");
    expect(src).toContain("persist:atmos-browser");
  });

  it("wires Desktop Use agent chrome on embedded click/type", () => {
    const control = readFileSync(join(root, "browser/browser-use-control.ts"), "utf8");
    const chrome = readFileSync(join(root, "browser/browser-use-chrome.ts"), "utf8");
    const src = `${control}\n${chrome}`;
    expect(src).toContain("showEmbeddedBrowserChrome");
    expect(src).toContain("mapGuestRectToScreen");
    expect(control).toContain("showChromeForRef");
    expect(chrome).toContain("spawnDetachedQuiet");
    expect(src).toContain('child.on("error"');
    expect(src).toContain("desktop-use");
    expect(src).toContain("drive");
    expect(src).toContain("highlight");
    expect(src).toContain("Clicking page");
    expect(src).toContain("Typing in page");
    // Click path remains CDP / DOM — not drive click
    expect(src).toContain("Input.dispatchMouseEvent");
    expect(src).toContain("el.click");
  });

  it("implements full browser action surface on embedded host", () => {
    const src = readFileSync(join(root, "browser/browser-use-control.ts"), "utf8");
    expect(src).toContain("pointerAction");
    expect(src).toContain("dialogAction");
    expect(src).toContain("downloadViaRef");
    expect(src).toContain("Page.handleJavaScriptDialog");
    expect(src).toContain("javascriptDialogOpening");
    expect(src).toContain("will-download");
    expect(src).toContain("mouseWheel");
    expect(src).toContain("Input.insertText");
  });
});

describe("mapGuestRectToScreen", () => {
  it("maps guest rect into host content origin", async () => {
    const { mapGuestRectToScreen } = await import("./browser-use-control.ts");
    const mapped = mapGuestRectToScreen(
      { x: 100, y: 200, width: 800, height: 600 },
      { x: 50, y: 40, width: 20, height: 10 },
    );
    expect(mapped.bounds).toEqual({ x: 150, y: 240, width: 20, height: 10 });
    expect(mapped.cursor).toEqual({ x: 160, y: 245 });
  });
});

describe("showEmbeddedBrowserChrome spawn safety", () => {
  it("does not throw or raise uncaughtException when atmos CLI is missing", async () => {
    const { showEmbeddedBrowserChrome } = await import("./browser-use-control.ts");
    const prev = process.env.ATMOS_CLI;
    // Path that cannot exist as an executable on this machine.
    process.env.ATMOS_CLI = join(
      homedir(),
      ".atmos-nonexistent-bin-for-chrome-test",
      "no-such-atmos",
    );
    let uncaught: Error | null = null;
    const onUncaught = (err: Error) => {
      uncaught = err;
    };
    process.on("uncaughtException", onUncaught);
    try {
      expect(() =>
        showEmbeddedBrowserChrome({
          status: "Clicking page",
          cursor: { x: 10, y: 20 },
          bounds: { x: 0, y: 0, width: 40, height: 30 },
        }),
      ).not.toThrow();
      // Allow ChildProcess 'error' (ENOENT) to fire and be handled.
      await new Promise((r) => setTimeout(r, 150));
      expect(uncaught).toBeNull();
    } finally {
      process.off("uncaughtException", onUncaught);
      if (prev === undefined) delete process.env.ATMOS_CLI;
      else process.env.ATMOS_CLI = prev;
    }
  });
});
