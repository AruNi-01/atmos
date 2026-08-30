// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { isPopoverConfirmKey } from "../popover-list-scroll";

function key(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">): KeyboardEvent {
  return {
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent;
}

describe("isPopoverConfirmKey", () => {
  it("treats Enter and Tab as confirm", () => {
    expect(isPopoverConfirmKey(key({ key: "Enter" }))).toBe(true);
    expect(isPopoverConfirmKey(key({ key: "Tab" }))).toBe(true);
  });

  it("ignores arrows and modified keys", () => {
    expect(isPopoverConfirmKey(key({ key: "ArrowDown" }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Tab", shiftKey: true }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Enter", metaKey: true }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Tab", ctrlKey: true }))).toBe(false);
  });
});
