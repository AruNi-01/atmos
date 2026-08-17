import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chromeTokens, resolveBoardTheme } from "./chrome";

describe("embed chrome tokens", () => {
  test("dark tokens never use a light canvas or light fallback foreground", () => {
    const dark = chromeTokens("dark");
    expect(dark.canvas).toBe("#09090b");
    expect(dark.fg).toContain("--foreground");
    expect(dark.fg).not.toContain("#18181b");
    expect(dark.bg).toContain("--background");
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

describe("excalidraw API handoff", () => {
  test("does not call onApi from the constructor-time excalidrawAPI callback", () => {
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(board).toContain("bindHostApi");
    expect(board).toContain("handedOffRef.current = true");
    expect(board).toContain("onApiRef.current(bindHostApi(api))");
    expect(board).not.toMatch(/excalidrawAPI=\{\(api\) => \{[\s\S]*onApiRef\.current/);
  });
});

describe("excalidraw Atmos chrome", () => {
  test("board disables invert and remaps islands to Atmos tokens", () => {
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./excalidraw-theme.css", import.meta.url), "utf8");
    const app = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(board).toContain('import "./excalidraw-theme.css"');
    expect(board).toContain("pt-design-excalidraw-theme");
    expect(board).toContain("DISABLE_CANVAS_INVERT");
    expect(board).toContain("MainMenu");
    expect(board).toContain("changeViewBackgroundColor: false");
    expect(board).not.toContain("DefaultItems");
    expect(css).toContain(".excalidraw.theme--dark canvas");
    expect(css).toContain("filter: none");
    expect(css).toContain("--theme-filter: none");
    expect(css).toContain("--island-bg-color: var(--card");
    expect(css).toContain("#09090b");
    expect(css).toContain(".zoom-actions");
    expect(css).toContain(".undo-redo-buttons");
    expect(css).toContain(".library-button");
    expect(css).toContain(".help-icon");
    expect(css).toContain(".color-picker__top-picks");
    expect(css).toContain("#fafafa");
    expect(app).toContain("echoFromBoardRef");
    expect(app).toContain("menuItems={menuItems}");
    expect(app).toContain("LibraryOverlay");
    expect(app).toContain('"save"');
    expect(app).toContain('"open"');
    expect(app).not.toMatch(/Add frame[\s\S]{0,80}Give to Agent/);
    expect(board).toContain("drawingAppState");
    expect(board).toContain("resolveDrawingStrokeColor");
    expect(board).toContain("applyThemeInkToElements");
    expect(app).toContain("drawingAppState(boardTheme)");
  });
});

describe("excalidraw collaboration", () => {
  test("board opens an Atmos share popover instead of the official dialog", () => {
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    const popover = readFileSync(new URL("./SharePopover.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./excalidraw-theme.css", import.meta.url), "utf8");
    expect(board).toContain("SharePopover");
    expect(board).toContain("pt-design-share-trigger");
    expect(board).not.toContain("LiveCollaborationTrigger");
    expect(board).toContain("isCollaborating");
    expect(app).toContain("useExcalidrawCollab");
    expect(app).toContain("sharePanel");
    expect(app).not.toContain("useLiveEvents");
    expect(app).not.toContain("AgentPulse");
    expect(popover).toContain("Your name");
    expect(popover).toContain("Copy prompt");
    expect(popover).toContain("local Atmos API");
    expect(popover).not.toContain("Copy MCP config");
    expect(popover).toContain("pt-design-share-tab-");
    expect(popover).toContain("localTab");
    expect(popover).toContain("inviteTab");
    expect(popover).toContain("Copy link");
    expect(popover).toContain("Paste a share link to join");
    expect(popover).toContain("onJoin");
    expect(popover).not.toContain("readOnly");
    expect(popover).toContain("Stop session");
    expect(popover).not.toMatch(/qr|QRCode/i);
    expect(css).toContain(".pt-design-share-trigger");
  });
});

