// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import "@/test-support/mobile-render-mock";

describe("mobile render mock", () => {
  test("keeps StyleSheet and AccessibilityInfo for whichever render test loads first", async () => {
    const reactNative = await import("react-native");
    expect(typeof reactNative.StyleSheet.create).toBe("function");
    expect(reactNative.StyleSheet.absoluteFill).toEqual({});
    expect(typeof reactNative.AccessibilityInfo.addEventListener).toBe("function");
    expect(reactNative.Platform.OS).toBe("ios");
  });
});
