import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CENTER_STAGE_FULLSCREEN_MOTION_MS,
  CENTER_STAGE_FULLSCREEN_Z_INDEX,
  centerStageFullscreenPinStyle,
  describeRectGrowth,
  measureExpandedCenterStageRect,
  paneHiddenByCenterFullscreen,
} from "@/app-shell/center-stage-fullscreen";
import { APP_FOOTER_HEIGHT_PX } from "@/app-shell/sidebar-layout-constants";
import { centerPaneFullscreenTileStyle } from "@/app-shell/center-pane/center-pane-leaf-metrics";
import {
  createDefaultLayout,
  DEFAULT_PANE_ID,
  splitPane,
} from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { useCenterStageFullscreenStore } from "@/app-shell/use-center-stage-fullscreen";

describe("center stage fullscreen geometry", () => {
  it("expands a left pane across sibling center regions, not the footer or sidebar", () => {
    const resting = { top: 48, left: 320, width: 480, height: 700 };
    const expanded = measureExpandedCenterStageRect({
      body: { top: 48, left: 320, width: 960, height: 700 },
      footerHeight: APP_FOOTER_HEIGHT_PX,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(expanded).toEqual({ top: 48, left: 320, width: 960, height: 700 });
    expect(expanded.height).toBe(resting.height);
    expect(describeRectGrowth(resting, expanded)).toEqual({
      growsLeft: false,
      growsRight: true,
      growsUp: false,
      growsDown: false,
    });
  });

  it("falls back below the header without covering the left sidebar or footer", () => {
    expect(
      measureExpandedCenterStageRect({
        headerBottom: 48,
        fallbackLeft: 320,
        footerHeight: APP_FOOTER_HEIGHT_PX,
        viewportWidth: 1280,
        viewportHeight: 800,
      }),
    ).toEqual({
      top: 48,
      left: 320,
      width: 960,
      height: 800 - 48 - APP_FOOTER_HEIGHT_PX,
    });
  });

  it("falls back to the area below the header when the body is missing", () => {
    expect(
      measureExpandedCenterStageRect({
        headerBottom: 48,
        footerHeight: APP_FOOTER_HEIGHT_PX,
        viewportWidth: 1280,
        viewportHeight: 800,
      }),
    ).toEqual({
      top: 48,
      left: 0,
      width: 1280,
      height: 800 - 48 - APP_FOOTER_HEIGHT_PX,
    });
  });

  it("pins with viewport-fixed box geometry instead of a scale transform", () => {
    const style = centerStageFullscreenPinStyle({
      top: 48,
      left: 0,
      width: 1280,
      height: 700,
    });
    expect(style.position).toBe("fixed");
    expect(style.zIndex).toBe(String(CENTER_STAGE_FULLSCREEN_Z_INDEX));
    expect(style.top).toBe("48px");
    expect(style.left).toBe("0px");
    expect(style.width).toBe("1280px");
    expect(style.height).toBe("700px");
    expect(style).not.toHaveProperty("transform");
    expect(CENTER_STAGE_FULLSCREEN_MOTION_MS).toBeGreaterThan(0);
  });

  it("hides sibling overlay content while the focused pane is fullscreen", () => {
    expect(paneHiddenByCenterFullscreen("pane-a", "pane-b")).toBe(true);
    expect(paneHiddenByCenterFullscreen("pane-a", "pane-a")).toBe(false);
    expect(paneHiddenByCenterFullscreen(null, "pane-b")).toBe(false);
  });

  it("fills the mosaic with calc geometry so the leaf can transition over siblings", () => {
    const style = centerPaneFullscreenTileStyle();
    expect(style.left).toBe("calc(0% + 0px)");
    expect(style.top).toBe("calc(0% + 0px)");
    expect(style.width).toBe("calc(100% - 0px)");
    expect(style.height).toBe("calc(100% - 0px)");
    expect(style.zIndex).toBe(String(CENTER_STAGE_FULLSCREEN_Z_INDEX));
  });
});

describe("center stage fullscreen wiring", () => {
  it("puts layout first and fullscreen last in the plus menu layout tab", () => {
    const tabBar = readFileSync(
      join(import.meta.dir, "../CenterStageTabBar.tsx"),
      "utf8",
    );
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    const layoutAt = menuBlock.indexOf("{layoutLabel}");
    const splitRightAt = menuBlock.indexOf("{splitRightLabel}");
    const splitDownAt = menuBlock.indexOf("{splitDownLabel}");
    const fullscreenAt = menuBlock.indexOf("{isCenterFullscreen ? exitFullscreenLabel : fullscreenLabel}");
    expect(layoutAt).toBeGreaterThan(0);
    expect(fullscreenAt).toBeGreaterThan(0);
    expect(splitRightAt).toBeGreaterThan(layoutAt);
    expect(splitDownAt).toBeGreaterThan(splitRightAt);
    expect(fullscreenAt).toBeGreaterThan(splitDownAt);
    expect(menuBlock).toContain("Maximize2");
    expect(menuBlock).toContain("Minimize2");
    expect(menuBlock).toContain("toggleCenterFullscreen(paneId)");
    expect(menuBlock).toContain("{showPaneFullscreenButton ? null : (");
  });

  it("puts a pane fullscreen toggle to the right of the plus button when split", () => {
    const tabBar = readFileSync(
      join(import.meta.dir, "../CenterStageTabBar.tsx"),
      "utf8",
    );
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    const actionsBlock = tabBar.slice(
      tabBar.indexOf("<CenterStageStickyTabActions>"),
      tabBar.indexOf("</CenterStageStickyTabActions>"),
    );
    const plusAt = actionsBlock.indexOf("<CenterStageNewTabMenu");
    const fullscreenAt = actionsBlock.indexOf("<CenterStagePaneFullscreenButton");
    const groupsAt = actionsBlock.indexOf("<CenterStageTabGroupPopover");
    expect(plusAt).toBeGreaterThan(0);
    expect(fullscreenAt).toBeGreaterThan(plusAt);
    expect(groupsAt).toBeGreaterThan(fullscreenAt);
    expect(actionsBlock).toContain("{isMultiPane ? (");
    expect(tabBar).toContain('data-center-stage-pane-fullscreen=""');
    expect(tabBar).toContain("showPaneFullscreenButton={isMultiPane}");
    expect(stage).toContain("isMultiPane={isMultiPane}");
    expect(tabBar).not.toContain('isCenterFullscreen && "bg-active text-foreground"');
  });

  it("persists pane fullscreen on the mosaic layout instead of clearing it on workspace hop", () => {
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    const hook = readFileSync(
      join(import.meta.dir, "../use-center-stage-fullscreen.ts"),
      "utf8",
    );
    const layout = readFileSync(
      join(import.meta.dir, "../center-pane/center-pane-layout.ts"),
      "utf8",
    );
    const store = readFileSync(
      join(import.meta.dir, "../center-pane/center-pane-layout-store.ts"),
      "utf8",
    );
    expect(layout).toContain("fullscreenPaneId?: string | null");
    expect(store).toContain("setFullscreenPane");
    expect(hook).toContain("persistFullscreenPane");
    expect(hook).toContain("syncFromLayout");
    expect(hook).not.toContain("if (isFullscreen) setFullscreen(false)");
    expect(stage).toContain("resolvedPaneLayout.fullscreenPaneId");
    expect(stage).toContain("syncFromLayout");
    expect(stage).not.toContain("setCenterFullscreen(false)");
    expect(stage).not.toContain("[mosaicContextId, setCenterFullscreen]");
  });

  it("keeps pane fullscreen on the mosaic when hopping away and syncing back", () => {
    const contextA = "ws-a";
    const contextB = "ws-b";
    useCenterPaneLayoutStore.setState({ byContext: {}, hydrated: true });
    useCenterStageFullscreenStore.setState({
      isFullscreen: false,
      paneId: null,
      contextId: null,
    });
    try {
      const layoutA = splitPane(
        createDefaultLayout(["terminal"], "terminal"),
        { direction: "right" },
      );
      const paneId = layoutA.order.find((id) => id !== DEFAULT_PANE_ID)!;
      useCenterPaneLayoutStore.getState().setLayout(contextA, layoutA);
      useCenterPaneLayoutStore.getState().setLayout(
        contextB,
        splitPane(createDefaultLayout(["files"], "files"), { direction: "right" }),
      );

      useCenterStageFullscreenStore.getState().syncFromLayout(contextA, null);
      useCenterStageFullscreenStore.getState().toggleFullscreen(paneId);
      expect(useCenterPaneLayoutStore.getState().getLayout(contextA)?.fullscreenPaneId).toBe(
        paneId,
      );

      const layoutB = useCenterPaneLayoutStore.getState().getLayout(contextB);
      useCenterStageFullscreenStore.getState().syncFromLayout(
        contextB,
        layoutB?.fullscreenPaneId ?? null,
      );
      expect(useCenterStageFullscreenStore.getState().isFullscreen).toBe(false);

      const restored = useCenterPaneLayoutStore.getState().getLayout(contextA);
      useCenterStageFullscreenStore.getState().syncFromLayout(
        contextA,
        restored?.fullscreenPaneId ?? null,
      );
      expect(useCenterStageFullscreenStore.getState().isFullscreen).toBe(true);
      expect(useCenterStageFullscreenStore.getState().paneId).toBe(paneId);
    } finally {
      useCenterPaneLayoutStore.getState().forgetContext(contextA);
      useCenterPaneLayoutStore.getState().forgetContext(contextB);
      useCenterPaneLayoutStore.setState({ byContext: {}, hydrated: true });
      useCenterStageFullscreenStore.setState({
        isFullscreen: false,
        paneId: null,
        contextId: null,
      });
    }
  });

  it("keeps floating-card gutters while a pane is fullscreen", () => {
    const css = readFileSync(
      join(import.meta.dir, "../center-pane/center-pane-grid.css"),
      "utf8",
    );
    expect(css).not.toContain("padding: 0 !important");
    expect(css).not.toContain("Eat the floating-card gutters");
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(stage).toContain("CENTER_STAGE_GUTTER_CLASS");
    expect(stage).toContain("CENTER_STAGE_SHELL_CLASS");
  });

  it("keeps an in-flow slot and expands the focused mosaic pane over siblings", () => {
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(stage).toContain('data-center-stage-fullscreen-slot=""');
    expect(stage).toContain("useCenterStageFullscreenMotion");
    expect(stage).toContain("fullscreenPaneId={activeFullscreenPaneId}");
    expect(stage).not.toContain("APP_SHELL_CENTER_COLUMN_ATTR");

    const hook = readFileSync(
      join(import.meta.dir, "../use-center-stage-fullscreen.ts"),
      "utf8",
    );
    expect(hook).not.toContain("APP_SHELL_CENTER_COLUMN_ATTR");
    expect(hook).not.toContain("APP_SHELL_PANEL_LAYOUT_ATTR");
    expect(hook).toContain("paneId");

    const grid = readFileSync(
      join(import.meta.dir, "../center-pane/CenterPaneGrid.tsx"),
      "utf8",
    );
    expect(grid).toContain("centerPaneFullscreenTileStyle");
    expect(grid).toContain("data-center-pane-fullscreen");

    const shell = readFileSync(join(import.meta.dir, "../AppShellMain.tsx"), "utf8");
    expect(shell).toContain("data-center-stage-body");
    expect(shell).toContain("<Footer />");
  });

  it("localizes fullscreen menu labels in every locale", () => {
    const en = JSON.parse(
      readFileSync(join(import.meta.dir, "../../../messages/en.json"), "utf8"),
    ) as { appShell: { centerStageTabBar: Record<string, string> } };
    const zh = JSON.parse(
      readFileSync(join(import.meta.dir, "../../../messages/zh.json"), "utf8"),
    ) as { appShell: { centerStageTabBar: Record<string, string> } };
    expect(en.appShell.centerStageTabBar.fullscreen).toBe("Fullscreen");
    expect(en.appShell.centerStageTabBar.exitFullscreen).toBe("Exit fullscreen");
    expect(zh.appShell.centerStageTabBar.fullscreen).toBe("全屏");
    expect(zh.appShell.centerStageTabBar.exitFullscreen).toBe("退出全屏");
  });
});
