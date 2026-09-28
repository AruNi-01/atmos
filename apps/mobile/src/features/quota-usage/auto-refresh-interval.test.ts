// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { noteSavedAutoRefresh, seedSavedAutoRefresh } from "./auto-refresh-interval";

describe("saved auto-refresh interval", () => {
  test("keeps the saved interval when a second selection is still optimistic", () => {
    const saved = seedSavedAutoRefresh(null, null);
    const again = seedSavedAutoRefresh(saved, 1);
    expect(again).toBe(saved);
    expect(again.minutes).toBeNull();
  });

  test("adopts a successful older request that finished after a newer one started", () => {
    const saved = seedSavedAutoRefresh(null, null);
    const applied = noteSavedAutoRefresh(saved, 1, 5);
    expect(applied.minutes).toBe(5);
  });

  test("ignores a stale success after a newer request was applied", () => {
    const saved = noteSavedAutoRefresh(seedSavedAutoRefresh(null, null), 2, 15);
    expect(noteSavedAutoRefresh(saved, 1, 5)).toEqual(saved);
  });
});
