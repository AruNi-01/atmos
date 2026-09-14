import { describe, expect, test } from "bun:test";
import { INTERACT_PRESS_NODE_TYPE, pressableButtonRoot } from "./interact-press";

function typed(type: string) {
  const el = {
    getAttribute: (key: string) => (key === "data-pt-type" ? type : null),
    closest: (selector: string) => (selector === "[data-pt-type]" ? el : null),
  };
  return el;
}

describe("pressableButtonRoot", () => {
  test("ignores non-primary buttons and missing targets", () => {
    expect(pressableButtonRoot({ button: 1, target: null })).toBe(null);
    expect(pressableButtonRoot({ button: 0, target: null })).toBe(null);
  });

  test("accepts only the nearest PT button node", () => {
    const button = typed("button");
    expect(pressableButtonRoot({ button: 0, target: button as never })).toBe(button as unknown as HTMLElement);
    expect(INTERACT_PRESS_NODE_TYPE).toBe("button");
  });

  test("does not treat switch, checkbox, toggle, or other controls as press targets", () => {
    for (const type of [
      "switch",
      "checkbox",
      "toggle",
      "toggle-group",
      "radio-group",
      "tabs",
      "pagination",
      "carousel",
      "calendar",
      "dialog",
      "item",
      "button-group",
      "form",
      "block.auth-form",
    ]) {
      expect(pressableButtonRoot({ button: 0, target: typed(type) as never })).toBe(null);
    }
  });
});
