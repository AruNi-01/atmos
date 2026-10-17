// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { chatForeground, chatMutedForeground } from "./chat-ink";

describe("chat ink", () => {
  test("uses web foreground and muted-foreground", () => {
    expect(chatForeground(false)).toBe("#09090b");
    expect(chatForeground(true)).toBe("#fafafa");
    expect(chatMutedForeground(false)).toBe("#71717b");
    expect(chatMutedForeground(true)).toBe("#9f9fa9");
  });
});
