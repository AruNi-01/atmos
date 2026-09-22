// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  DRAWER_CORNER_RADIUS,
  DRAWER_EDGE_INSET,
  drawerAttachTop,
  drawerChrome,
  nextDrawerSnap,
} from "./expo-drawer-geometry";

describe("drawer chrome", () => {
  test("keeps a screen-edge gap at the half detent", () => {
    const chrome = drawerChrome(460, 1000);
    expect(chrome.halfTop).toBe(460);
    expect(chrome.inset).toBe(DRAWER_EDGE_INSET);
    expect(chrome.radius).toBe(DRAWER_CORNER_RADIUS);
  });

  test("keeps the gap until the sheet is nearly full", () => {
    const attachTop = drawerAttachTop(1000);
    expect(attachTop).toBe(88);
    const stillFloating = drawerChrome(120, 1000);
    expect(stillFloating.inset).toBe(DRAWER_EDGE_INSET);
    expect(stillFloating.radius).toBe(DRAWER_CORNER_RADIUS);
  });

  test("goes edge-attached at full height", () => {
    const chrome = drawerChrome(0, 1000);
    expect(chrome.inset).toBe(0);
    expect(chrome.radius).toBe(0);
    expect(chrome.progress).toBe(1);
  });

  test("eases the last stretch into the screen edge", () => {
    const attaching = drawerChrome(44, 1000);
    expect(attaching.inset).toBeGreaterThan(0);
    expect(attaching.inset).toBeLessThan(DRAWER_EDGE_INSET);
    expect(attaching.radius).toBeGreaterThan(0);
    expect(attaching.radius).toBeLessThan(DRAWER_CORNER_RADIUS);
  });

  test("snaps to full when dragged past the midpoint", () => {
    expect(nextDrawerSnap({ halfTop: 460, top: 120, vy: 0 })).toBe("full");
    expect(nextDrawerSnap({ halfTop: 460, top: 400, vy: 0 })).toBe("half");
    expect(nextDrawerSnap({ halfTop: 460, top: 560, vy: 0 })).toBe("dismiss");
  });

  test("lets a fast flick choose the detent", () => {
    expect(nextDrawerSnap({ halfTop: 460, top: 400, vy: -1.4 })).toBe("full");
    expect(nextDrawerSnap({ halfTop: 460, top: 80, vy: 1.4 })).toBe("half");
  });
});
