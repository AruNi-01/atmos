import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isClosingToggle, restoreScrollChain } from "./sidebar-motion";

describe("sidebar motion", () => {
  test("detects when toggleSidebar will close the open drawer", () => {
    expect(
      isClosingToggle(
        { name: "components", tab: "component" },
        { name: "components", tab: "component" },
      ),
    ).toBe(true);
    expect(
      isClosingToggle({ name: "default", tab: "library" }, { name: "default", tab: "library" }),
    ).toBe(true);
    expect(
      isClosingToggle({ name: "default", tab: "search" }, { name: "default", tab: "library" }),
    ).toBe(false);
    expect(isClosingToggle({ name: "default" }, { name: "components" })).toBe(false);
    expect(isClosingToggle(null, { name: "default" })).toBe(false);
    expect(isClosingToggle({ name: "components" }, { name: "components", force: false })).toBe(
      true,
    );
    expect(isClosingToggle({ name: "components" }, { name: "components", force: true })).toBe(
      false,
    );
  });

  test("puts ancestor scroll back when the drawer focus shifts it", () => {
    const box = { scrollLeft: 40, scrollTop: 12 };
    restoreScrollChain([{ box, left: 0, top: 0 }]);
    expect(box).toEqual({ scrollLeft: 0, scrollTop: 0 });
    restoreScrollChain([{ box, left: 0, top: 0 }]);
    expect(box.scrollLeft).toBe(0);
  });

  test("chrome CSS and board wire the press and drawer motion", () => {
    const css = readFileSync(new URL("./excalidraw-theme.css", import.meta.url), "utf8");
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const motion = readFileSync(new URL("./sidebar-motion.ts", import.meta.url), "utf8");
    expect(css).toContain("pt-design-drawer-in");
    expect(css).toContain("translate3d(100%, 0, 0)");
    expect(css).toContain(
      "animation: pt-design-drawer-in 280ms cubic-bezier(0.32, 0.72, 0, 1) backwards",
    );
    expect(css).toContain("width: 100% !important");
    expect(css).toContain("a.library-menu-browse-button");
    expect(css).toContain(".layer-ui__search-header");
    expect(css).toContain(".library-unit--skeleton");
    expect(css).toContain("overflow: clip");
    expect(board).toContain('overflow: "clip"');
    expect(motion).toContain("restoreScrollChain");
    expect(motion).toContain("armSidebarScrollPin");
    expect(css).toContain('.sidebar[data-pt-leaving="true"]');
    expect(css).toContain(".pt-design-sidebar-exit");
    expect(css).toContain('.sidebar[data-pt-leaving="true"]');
    expect(css).toMatch(/data-pt-leaving[\s\S]{0,120}box-shadow: none/);
    expect(motion).toContain("commitStyles");
    expect(motion).toContain("freezeOffscreen");
    expect(motion).toContain("opacity: 0");
    expect(motion).toContain("afterPaint");
    expect(css).toContain(".dropdown-menu-button:active");
    expect(css).toContain("scale(0.96)");
    expect(board).toContain("whileTap");
    expect(board).toContain("sidebar-trigger");
    expect(board).toContain("observeSidebarExit");
    expect(board).toContain("wrapToggleSidebar");
    expect(board).toContain("onPointerDown");
  });
});
