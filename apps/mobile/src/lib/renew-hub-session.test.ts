// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { hubSessionRenewalAction } from "./hub-session-renewal";

describe("hub session renewal", () => {
  test("saves a profile when Hub still accepts the device", () => {
    expect(hubSessionRenewalAction({ user_id: "user-1", name: "Aaryn" }, false)).toBe("save");
  });

  test("expires the local session only when Hub says unauthorized", () => {
    expect(hubSessionRenewalAction(null, false)).toBe("expire");
  });

  test("keeps the cached profile when the network fails", () => {
    expect(hubSessionRenewalAction(null, true)).toBe("keep");
  });
});
