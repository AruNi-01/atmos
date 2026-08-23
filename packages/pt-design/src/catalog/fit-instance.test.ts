import { describe, expect, test } from "bun:test";
import { getComponentTemplate } from "./registry";
import { fitInstanceElements } from "./fit-instance";

describe("fitInstanceElements", () => {
  test("scales a card group to a target bbox", () => {
    const built = getComponentTemplate("card", { x: 10, y: 20, props: {} });
    const fitted = fitInstanceElements(
      built.elements,
      { x: 10, y: 20, w: built.width, h: built.height },
      { x: 10, y: 20, w: 420, h: 176 },
    );
    const root = fitted.find((el) => el.customData?.pt?.componentType === "card");
    expect(root?.width).toBe(420);
    expect(root?.height).toBe(176);
    expect(fitted.some((el) => el.width > built.elements[0]!.width || el.x !== 10)).toBe(true);
  });
});
