// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  beginUserMessageOutsidePress,
  markUserMessageBodyPress,
  markUserMessageMetaPress,
  subscribeUserMessageOutsidePress,
  userMessageOutsidePressCloses,
} from "./user-message-outside";

const dir = dirname(fileURLToPath(import.meta.url));

function flush(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve());
  });
}

describe("user message outside press", () => {
  test("a press outside the bubble closes the body and the time row", () => {
    expect(userMessageOutsidePressCloses("a", { bodyId: null, metaId: null })).toEqual({
      body: true,
      meta: true,
    });
    expect(userMessageOutsidePressCloses("a", { bodyId: "b", metaId: null })).toEqual({
      body: true,
      meta: true,
    });
  });

  test("a press on the body leaves both open", () => {
    expect(userMessageOutsidePressCloses("a", { bodyId: "a", metaId: null })).toEqual({
      body: false,
      meta: false,
    });
  });

  test("a press on the time row shrinks the body and leaves the time row open", () => {
    expect(userMessageOutsidePressCloses("a", { bodyId: null, metaId: "a" })).toEqual({
      body: true,
      meta: false,
    });
  });

  test("the capture reports the press after the target has marked itself", async () => {
    const seen: Array<{ bodyId: string | null; metaId: string | null }> = [];
    const unsubscribe = subscribeUserMessageOutsidePress((press) => {
      seen.push(press);
    });
    beginUserMessageOutsidePress();
    markUserMessageBodyPress("row");
    await flush();
    expect(seen).toEqual([{ bodyId: "row", metaId: null }]);

    beginUserMessageOutsidePress();
    markUserMessageMetaPress("row");
    markUserMessageBodyPress("row");
    await flush();
    expect(seen[1]).toEqual({ bodyId: null, metaId: "row" });

    beginUserMessageOutsidePress();
    await flush();
    expect(seen[2]).toEqual({ bodyId: null, metaId: null });

    unsubscribe();
    beginUserMessageOutsidePress();
    await flush();
    expect(seen).toHaveLength(3);
  });

  test("the bubble and the chat frames listen for the same press", () => {
    const message = readFileSync(join(dir, "user-message.tsx"), "utf8");
    const frame = readFileSync(join(dir, "chat-keyboard-frame.tsx"), "utf8");
    const preview = readFileSync(join(dir, "preview-chat-screen.tsx"), "utf8");
    const outside = readFileSync(join(dir, "user-message-outside.ts"), "utf8");
    expect(message).toContain("subscribeUserMessageOutsidePress");
    expect(message).toContain("markUserMessageBodyPress(entryId)");
    expect(message).toContain("markUserMessageMetaPress(entryId)");
    expect(message).toContain("userMessageOutsidePressCloses(entryId, press)");
    expect(frame).toContain("{...userMessageOutsidePressCapture()}");
    expect(preview).toContain("{...userMessageOutsidePressCapture()}");
    expect(outside).toContain("onTouchStartCapture: beginUserMessageOutsidePress");
  });
});
