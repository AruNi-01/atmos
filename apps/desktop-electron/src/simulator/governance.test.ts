import { describe, expect, it } from "bun:test";
import {
  HIDE_THROTTLE_MS,
  IDLE_RELEASE_MS,
  NATIVE_FPS,
  NATIVE_MAX_DIMENSION,
  shouldReleaseIdle,
  shouldThrottle,
  THROTTLE_MAX_FPS,
  workspacesOverWarmCap,
} from "./governance.ts";

describe("simulator governance", () => {
  it("throttles within 5s of hide and releases at 10 min", () => {
    const hidden = {
      workspaceId: "ws-a",
      visibleSurfaces: 0,
      lastVisibleAt: 1_000,
    };
    expect(shouldThrottle(hidden, 1_000 + HIDE_THROTTLE_MS - 1)).toBe(false);
    expect(shouldThrottle(hidden, 1_000 + HIDE_THROTTLE_MS)).toBe(true);
    expect(shouldReleaseIdle(hidden, 1_000 + IDLE_RELEASE_MS - 1)).toBe(false);
    expect(shouldReleaseIdle(hidden, 1_000 + IDLE_RELEASE_MS)).toBe(true);
  });

  it("exposes native stream-settings for restore-on-show", () => {
    expect(NATIVE_FPS).toBeGreaterThan(THROTTLE_MAX_FPS);
    expect(NATIVE_MAX_DIMENSION).toBeGreaterThan(720);
  });

  it("kills the least-recently-visible session at cap 2", () => {
    const killed = workspacesOverWarmCap(
      [
        { workspaceId: "old", visibleSurfaces: 1, lastVisibleAt: 1 },
        { workspaceId: "mid", visibleSurfaces: 1, lastVisibleAt: 2 },
        { workspaceId: "new", visibleSurfaces: 1, lastVisibleAt: 3 },
      ],
      2,
    );
    expect(killed).toEqual(["old"]);
  });
});
