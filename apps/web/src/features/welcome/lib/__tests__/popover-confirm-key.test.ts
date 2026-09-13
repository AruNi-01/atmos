// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { isPopoverConfirmKey, resolvePopoverScrollContainer } from "../popover-list-scroll";

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

  it("prefers the ScrollArea viewport when present", () => {
    const viewport = { id: "viewport" } as unknown as HTMLElement;
    const root = {
      querySelector: (sel: string) =>
        sel.includes("scroll-area-viewport") ? viewport : null,
    } as unknown as HTMLElement;
    expect(resolvePopoverScrollContainer(root)).toBe(viewport);
    const plain = { querySelector: () => null } as unknown as HTMLElement;
    expect(resolvePopoverScrollContainer(plain)).toBe(plain);
  });

  it("ignores arrows and modified keys", () => {
    expect(isPopoverConfirmKey(key({ key: "ArrowDown" }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Tab", shiftKey: true }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Enter", metaKey: true }))).toBe(false);
    expect(isPopoverConfirmKey(key({ key: "Tab", ctrlKey: true }))).toBe(false);
  });
});
