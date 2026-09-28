// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { mergeQuotaSwitchSnapshot } from "./quota-switch-snapshot";

const providers = [
  { id: "a", switch_enabled: false },
  { id: "b", switch_enabled: false },
];

describe("mergeQuotaSwitchSnapshot", () => {
  test("keeps a local switch that a later snapshot did not include", () => {
    const merged = mergeQuotaSwitchSnapshot(
      [
        { id: "a", switch_enabled: true },
        { id: "b", switch_enabled: true },
      ],
      [
        { id: "a", switch_enabled: false },
        { id: "b", switch_enabled: true },
      ],
      (id) => id === "b",
    );
    expect(merged.map((provider) => provider.switch_enabled)).toEqual([true, true]);
  });

  test("uses the server switch when this response is allowed to set it", () => {
    const merged = mergeQuotaSwitchSnapshot(providers, [{ id: "a", switch_enabled: true }], () => true);
    expect(merged).toEqual([{ id: "a", switch_enabled: true }]);
  });
});
