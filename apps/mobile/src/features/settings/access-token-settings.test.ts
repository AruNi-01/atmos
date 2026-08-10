// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { getAccessTokenSwitchReadiness } from "./access-token-settings";

describe("device credential settings", () => {
  test("requires a plausible credential before switching", () => {
    expect(getAccessTokenSwitchReadiness({ isSaving: false, token: "" })).toEqual({
      canSwitch: false,
      reason: "Paste a device credential to switch this phone.",
    });

    expect(getAccessTokenSwitchReadiness({ isSaving: false, token: "short" })).toEqual({
      canSwitch: false,
      reason: "Device credential must be at least 32 characters.",
    });
  });

  test("allows switching when a long credential is pasted", () => {
    expect(
      getAccessTokenSwitchReadiness({
        isSaving: false,
        token: "a".repeat(32),
      }),
    ).toEqual({ canSwitch: true, reason: null });
  });

  test("disables switching while a save is already pending", () => {
    expect(
      getAccessTokenSwitchReadiness({
        isSaving: true,
        token: "a".repeat(32),
      }),
    ).toEqual({ canSwitch: false, reason: null });
  });
});
