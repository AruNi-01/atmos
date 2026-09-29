// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  adoptSavedAutoRefresh,
  noteSavedAutoRefresh,
  savedAutoRefreshMinutes,
  seedSavedAutoRefresh,
} from "./auto-refresh-interval";

describe("saved auto-refresh interval", () => {
  test("keeps the saved interval when a second selection is still optimistic", () => {
    const saved = seedSavedAutoRefresh(null, "computer-a", { minutes: null });
    const again = seedSavedAutoRefresh(saved, "computer-a", { minutes: 1 });
    expect(again).toBe(saved);
    expect(again?.minutes).toBeNull();
  });

  test("adopts a successful older request that finished after a newer one started", () => {
    const saved = seedSavedAutoRefresh(null, "computer-a", { minutes: null });
    if (!saved) throw new Error("expected a saved interval");
    const applied = noteSavedAutoRefresh(saved, 1, 5);
    expect(applied.minutes).toBe(5);
  });

  test("ignores a stale success after a newer request was applied", () => {
    const saved = seedSavedAutoRefresh(null, "computer-a", { minutes: null });
    if (!saved) throw new Error("expected a saved interval");
    const applied = noteSavedAutoRefresh(saved, 2, 15);
    expect(noteSavedAutoRefresh(applied, 1, 5)).toEqual(applied);
  });

  test("does not keep another Computer's interval when this Computer has no overview yet", () => {
    const computerA = seedSavedAutoRefresh(null, "computer-a", { minutes: 15 });
    const switched = adoptSavedAutoRefresh(computerA, "computer-b", false, null, false);
    const pending = seedSavedAutoRefresh(switched, "computer-b", null);
    expect(pending).toBeNull();
    expect(savedAutoRefreshMinutes(computerA, "computer-b")).toBeUndefined();
  });

  test("rolls back to the new Computer's overview when a change fails after that overview loads", () => {
    const computerA = seedSavedAutoRefresh(null, "computer-a", { minutes: 15 });
    const pending = seedSavedAutoRefresh(computerA, "computer-b", null);
    const loaded = adoptSavedAutoRefresh(pending, "computer-b", true, 30, true);
    expect(savedAutoRefreshMinutes(loaded, "computer-b")).toBe(30);
  });

  test("seeds a Computer from its own cached overview", () => {
    const computerA = seedSavedAutoRefresh(null, "computer-a", { minutes: 15 });
    expect(seedSavedAutoRefresh(computerA, "computer-b", { minutes: 30 })).toEqual({
      computerKey: "computer-b",
      minutes: 30,
      appliedGeneration: 0,
    });
  });

  test("does not adopt an optimistic interval over this Computer's known baseline", () => {
    const saved = seedSavedAutoRefresh(null, "computer-b", { minutes: 30 });
    expect(adoptSavedAutoRefresh(saved, "computer-b", true, 5, true)).toBe(saved);
  });
});
