import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CENTER_STAGE_FULLSCREEN_MOTION_MS,
  CENTER_STAGE_FULLSCREEN_Z_INDEX,
  centerStageFullscreenPinStyle,
  describeRectGrowth,
  measureExpandedCenterStageRect,
} from "@/app-shell/center-stage-fullscreen";

describe("center stage fullscreen geometry", () => {
  it("expands a right-hand stage left and down over the panel layout", () => {
    const resting = { top: 48, left: 320, width: 960, height: 700 };
    const expanded = measureExpandedCenterStageRect({
      panel: { top: 48, left: 0, width: 1280, height: 752 },
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(expanded).toEqual({ top: 48, left: 0, width: 1280, height: 752 });
    expect(describeRectGrowth(resting, expanded)).toEqual({
      growsLeft: true,
      growsRight: false,
      growsUp: false,
      growsDown: true,
    });
  });

  it("falls back to the area below the header when the panel is missing", () => {
    expect(
      measureExpandedCenterStageRect({
        headerBottom: 48,
        viewportWidth: 1280,
        viewportHeight: 800,
      }),
    ).toEqual({ top: 48, left: 0, width: 1280, height: 752 });
  });

  it("pins with viewport-fixed box geometry instead of a scale transform", () => {
    const style = centerStageFullscreenPinStyle({
      top: 48,
      left: 0,
      width: 1280,
      height: 752,
    });
    expect(style.position).toBe("fixed");
    expect(style.zIndex).toBe(String(CENTER_STAGE_FULLSCREEN_Z_INDEX));
    expect(style.top).toBe("48px");
    expect(style.left).toBe("0px");
    expect(style.width).toBe("1280px");
    expect(style.height).toBe("752px");
    expect(style).not.toHaveProperty("transform");
    expect(CENTER_STAGE_FULLSCREEN_MOTION_MS).toBeGreaterThan(0);
  });
});

describe("center stage fullscreen wiring", () => {
  it("puts fullscreen above split in the plus menu", () => {
    const tabBar = readFileSync(
      join(import.meta.dir, "../CenterStageTabBar.tsx"),
      "utf8",
    );
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    const fullscreenAt = menuBlock.indexOf("{isCenterFullscreen ? exitFullscreenLabel : fullscreenLabel}");
    const splitRightAt = menuBlock.indexOf("{splitRightLabel}");
    const splitDownAt = menuBlock.indexOf("{splitDownLabel}");
    expect(fullscreenAt).toBeGreaterThan(0);
    expect(splitRightAt).toBeGreaterThan(fullscreenAt);
    expect(splitDownAt).toBeGreaterThan(splitRightAt);
    expect(menuBlock).toContain("Maximize2");
    expect(menuBlock).toContain("Minimize2");
  });

  it("keeps an in-flow slot so overlaying the stage does not collapse other regions", () => {
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(stage).toContain('data-center-stage-fullscreen-slot=""');
    expect(stage).toContain("useCenterStageFullscreenMotion");

    const layout = readFileSync(join(import.meta.dir, "../PanelLayout.tsx"), "utf8");
    expect(layout).toContain('data-app-shell-panel-layout=""');
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
