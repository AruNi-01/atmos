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
    expect(css).toContain(".default-sidebar-trigger");
    expect(css).toContain(".sidebar-trigger__label-element");
    expect(css).toContain(".sidebar__dock");
    expect(css).toContain("border-radius: 12px");
    expect(css).toContain(".pt-design-island-trigger");
    expect(css).toContain(".sidebar-tab-trigger");
    expect(css).toContain(".sidebar__header::after");
    expect(css).toContain("display: none");
    expect(css).toContain(".default-sidebar .sidebar-triggers");
    expect(css).toContain(".pt-design-library-sidebar .sidebar-triggers .sidebar-tab-trigger:nth-child(1)::after");
    expect(css).toContain('.pt-design-library-sidebar .sidebar-triggers .sidebar-tab-trigger:nth-child(2)::after');
    expect(css).toContain('content: "Search"');
    expect(css).toContain('content: "Library"');
    expect(css).toContain('content: "搜索"');
    expect(css).toContain('content: "素材库"');
    expect(board).toContain("pt-design-catalog-tab-component");
    expect(board).toContain("pt-design-catalog-tab-block");
    expect(board).toContain("BlockSidebarIcon");
    expect(board).toContain("ComponentSidebarIcon");
    expect(board).toContain("pt-design-library-sidebar");
    expect(board).toContain("blockCatalog");
    expect(css).toContain('data-icon-only="true"');
    expect(css).toContain(".color-picker__top-picks");
    expect(css).toContain("#fafafa");
    expect(css).toContain("input.pt-design-catalog-search");
    expect(css).toContain(".pt-design-place-reveal");
    expect(css).toContain("pt-design-place-breathe");
    expect(css).toContain(".excalidraw .follow-mode");
    expect(css).toContain("border-radius: var(--radius-xl");
    expect(app).toContain("scrollToContent");
    expect(app).toContain("PLACE_SCROLL_OFFSETS");
    expect(app).toContain("echoFromBoardRef");
    expect(app).toContain("menuItems={menuItems}");
    expect(app).toContain("LibraryOverlay");
    expect(app).toContain('"save"');
    expect(app).toContain('"open"');
    expect(app).not.toMatch(/Add frame[\s\S]{0,80}Give to Agent/);
    expect(board).toContain("drawingAppState");
    expect(board).toContain("resolveDrawingStrokeColor");
    expect(board).toContain("applyThemeInkToElements");
    expect(board).toContain("DefaultSidebar");
    expect(board).toContain("pt-design-library-trigger");
    expect(board).toContain("iconOnly");
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
    expect(app).toContain("clientId");
    expect(app).not.toMatch(/if \(!agentBridge \|\| !collab\.room\)/);
    expect(app).not.toMatch(/id: "give-to-agent"[\s\S]{0,400}collab\.start/);
    expect(app).not.toMatch(/const openShare[\s\S]{0,80}collab\.start/);
    expect(app).not.toContain("useLiveEvents");
    expect(app).not.toContain("AgentPulse");
    expect(popover).toContain("Your name");
    expect(popover).toContain("Copy prompt");
    expect(popover).toContain("open board");
    expect(popover).not.toContain("no Share, MCP");
    expect(popover).not.toContain("Copy MCP config");
    expect(popover).toContain("pt-design-share-tab-${id}");
    expect(popover).toContain('"agent"');
    expect(popover).toContain('"human"');
    expect(popover).toContain("agentTab");
    expect(popover).toContain("humanTab");
    expect(popover).toContain("With Agent");
    expect(popover).toContain("With Human");
    expect(popover).toContain("Collaborate");
    expect(popover).toContain("Copy link");
    expect(popover).toContain("Paste a collaboration link to join");
    expect(popover).toContain("onJoin");
    expect(popover).not.toContain("readOnly");
    expect(popover).toContain("Start collaboration");
    expect(popover).toContain("Stop collaboration");
    expect(popover).not.toContain("Stop session");
    expect(popover).not.toMatch(/qr|QRCode/i);
    expect(css).toContain(".pt-design-share-trigger");
  });
});

