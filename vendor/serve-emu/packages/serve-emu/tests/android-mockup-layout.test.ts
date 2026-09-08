import { describe, expect, test } from "bun:test";
import {
  fitAndroidMockupScreen,
  isAndroidTabletScreen,
} from "../src/ui/lib/android-mockup-layout.ts";

describe("android mockup layout", () => {
  test("classifies phones and tablets by aspect ratio", () => {
    expect(isAndroidTabletScreen(1080, 2400)).toBe(false);
    expect(isAndroidTabletScreen(1080, 1920)).toBe(false);
    expect(isAndroidTabletScreen(1600, 2560)).toBe(true);
    expect(isAndroidTabletScreen(2560, 1600)).toBe(true);
  });

  test("fits a portrait phone inside the available box", () => {
    const fitted = fitAndroidMockupScreen(400, 800, 1080, 2400);
    expect(fitted.isLandscape).toBe(false);
    expect(fitted.isTablet).toBe(false);
    expect(fitted.screenWidth).toBeGreaterThan(80);
    expect(fitted.screenHeight / fitted.screenWidth).toBeCloseTo(2400 / 1080, 2);
    expect(fitted.screenWidth).toBeLessThanOrEqual(400);
    expect(fitted.screenHeight).toBeLessThanOrEqual(800);
  });

  test("fits a landscape tablet without overflowing", () => {
    const fitted = fitAndroidMockupScreen(900, 500, 2560, 1600);
    expect(fitted.isLandscape).toBe(true);
    expect(fitted.isTablet).toBe(true);
    expect(fitted.screenWidth).toBeGreaterThan(fitted.screenHeight);
  });
});
