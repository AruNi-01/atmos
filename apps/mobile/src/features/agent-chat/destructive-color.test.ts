// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import {
  CHAT_DESTRUCTIVE_BORDER_DARK,
  CHAT_DESTRUCTIVE_BORDER_LIGHT,
  CHAT_DESTRUCTIVE_DARK,
  CHAT_DESTRUCTIVE_LIGHT,
  CHAT_DESTRUCTIVE_SURFACE_DARK,
  CHAT_DESTRUCTIVE_SURFACE_LIGHT,
  chatDestructiveBorder,
  chatDestructiveColor,
  chatDestructiveSurface,
} from "./destructive-color";

describe("chat destructive color", () => {
  test("matches the sRGB clip of web --destructive", () => {
    expect(CHAT_DESTRUCTIVE_LIGHT).toBe("#e7000b");
    expect(CHAT_DESTRUCTIVE_DARK).toBe("#ff6467");
    expect(chatDestructiveColor(false)).toBe(CHAT_DESTRUCTIVE_LIGHT);
    expect(chatDestructiveColor(true)).toBe(CHAT_DESTRUCTIVE_DARK);
    expect(chatDestructiveSurface(false)).toBe(CHAT_DESTRUCTIVE_SURFACE_LIGHT);
    expect(chatDestructiveSurface(true)).toBe(CHAT_DESTRUCTIVE_SURFACE_DARK);
    expect(chatDestructiveBorder(false)).toBe(CHAT_DESTRUCTIVE_BORDER_LIGHT);
    expect(chatDestructiveBorder(true)).toBe(CHAT_DESTRUCTIVE_BORDER_DARK);
    expect(CHAT_DESTRUCTIVE_SURFACE_LIGHT).toBe("rgba(231, 0, 11, 0.05)");
    expect(CHAT_DESTRUCTIVE_BORDER_LIGHT).toBe("rgba(231, 0, 11, 0.3)");
  });
});
