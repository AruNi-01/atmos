// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  beginUserMessageBodyPress,
  claimUserMessageInnerPress,
  currentUserMessageBodyPress,
  resetUserMessagePressForTests,
  takeUserMessageInnerPress,
  userMessageBodyPressEffect,
} from "./user-message-press";

describe("user message inner press", () => {
  test("a link leaves the bubble alone and a paste chip skips the time row", () => {
    expect(userMessageBodyPressEffect("link")).toEqual({ expand: false, toggleMeta: false });
    expect(userMessageBodyPressEffect("paste")).toEqual({ expand: true, toggleMeta: false });
    expect(userMessageBodyPressEffect(null)).toEqual({ expand: true, toggleMeta: true });
  });

  test("the mark belongs to the touch that is already down", () => {
    resetUserMessagePressForTests();
    const first = beginUserMessageBodyPress();
    claimUserMessageInnerPress("link");
    expect(takeUserMessageInnerPress(first)).toBe("link");
    expect(takeUserMessageInnerPress(first)).toBeNull();

    const second = beginUserMessageBodyPress();
    claimUserMessageInnerPress("paste");
    const third = beginUserMessageBodyPress();
    expect(takeUserMessageInnerPress(third)).toBeNull();
    claimUserMessageInnerPress("link");
    expect(takeUserMessageInnerPress(third)).toBe("link");
    expect(takeUserMessageInnerPress(second)).toBeNull();
    expect(currentUserMessageBodyPress()).toBe(third);
  });
});
