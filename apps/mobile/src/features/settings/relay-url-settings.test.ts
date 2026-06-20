// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { getRelayUrlSaveState } from "./relay-url-settings";

describe("getRelayUrlSaveState", () => {
  test("normalizes host-only drafts", () => {
    expect(
      getRelayUrlSaveState({
        currentUrl: "https://relay.atmos.land",
        draftUrl: "staging-relay.atmos.land/",
      }),
    ).toEqual({
      canSave: true,
      normalizedUrl: "https://staging-relay.atmos.land",
      reason: null,
    });
  });

  test("blocks unchanged normalized URLs", () => {
    expect(
      getRelayUrlSaveState({
        currentUrl: "https://relay.atmos.land",
        draftUrl: " https://relay.atmos.land/ ",
      }),
    ).toEqual({
      canSave: false,
      normalizedUrl: "https://relay.atmos.land",
      reason: "Relay URL is already saved.",
    });
  });
});
