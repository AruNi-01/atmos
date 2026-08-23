import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isClosingToggle } from "./sidebar-motion";

describe("sidebar motion", () => {
  test("detects when toggleSidebar will close the open drawer", () => {
    expect(isClosingToggle({ name: "components", tab: "component" }, { name: "components", tab: "component" })).toBe(true);
    expect(isClosingToggle({ name: "default", tab: "library" }, { name: "default", tab: "library" })).toBe(true);
    expect(isClosingToggle({ name: "default", tab: "search" }, { name: "default", tab: "library" })).toBe(false);
    expect(isClosingToggle({ name: "default" }, { name: "components" })).toBe(false);
    expect(isClosingToggle(null, { name: "default" })).toBe(false);
    expect(isClosingToggle({ name: "components" }, { name: "components", force: false })).toBe(true);
    expect(isClosingToggle({ name: "components" }, { name: "components", force: true })).toBe(false);
  });

  test("chrome CSS and board wire the press and drawer motion", () => {
    const css = readFileSync(new URL("./excalidraw-theme.css", import.meta.url), "utf8");
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(css).toContain("pt-design-drawer-in");
    expect(css).toContain(".sidebar[data-pt-leaving=\"true\"]");
    expect(css).toContain(".pt-design-sidebar-exit");
    expect(css).toContain(".dropdown-menu-button:active");
    expect(css).toContain("scale(0.96)");
    expect(board).toContain("whileTap");
    expect(board).toContain("sidebar-trigger");
    expect(board).toContain("observeSidebarExit");
    expect(board).toContain("wrapToggleSidebar");
    expect(board).toContain("onPointerDown");
  });
});


