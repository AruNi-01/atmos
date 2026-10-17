// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  chatForeground,
  chatForeground80,
  chatForeground90,
  chatMutedForeground,
} from "./chat-ink";

describe("chat ink", () => {
  test("uses web foreground and muted-foreground", () => {
    expect(chatForeground(false)).toBe("#09090b");
    expect(chatForeground(true)).toBe("#fafafa");
    expect(chatMutedForeground(false)).toBe("#71717b");
    expect(chatMutedForeground(true)).toBe("#9f9fa9");
    expect(chatForeground80(false)).toBe("rgba(9, 9, 11, 0.8)");
    expect(chatForeground80(true)).toBe("rgba(250, 250, 250, 0.8)");
    expect(chatForeground90(false)).toBe("rgba(9, 9, 11, 0.9)");
    expect(chatForeground90(true)).toBe("rgba(250, 250, 250, 0.9)");
  });
});
