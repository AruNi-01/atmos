import { describe, expect, it } from "bun:test";
import {
  releaseClaim,
  takeOverClaim,
  tryAcquireClaim,
} from "./claims.ts";

describe("simulator claims", () => {
  it("refuses a second workspace with simulator_in_use and the holder", () => {
    const first = tryAcquireClaim({}, "SIM-1", "ws-a", "inst-1", "t0");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = tryAcquireClaim(first.table, "SIM-1", "ws-b", "inst-1", "t1");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("simulator_in_use");
    expect(second.holder.workspaceId).toBe("ws-a");
  });

  it("take-over replaces the holder", () => {
    const first = tryAcquireClaim({}, "SIM-1", "ws-a", "inst-1", "t0");
    if (!first.ok) throw new Error("expected claim");
    const taken = takeOverClaim(first.table, "SIM-1", "ws-b", "inst-2", "t1");
    expect(taken.previous?.workspaceId).toBe("ws-a");
    expect(taken.table["SIM-1"]?.workspaceId).toBe("ws-b");
    const released = releaseClaim(taken.table, "SIM-1", "ws-b");
    expect(released["SIM-1"]).toBeUndefined();
  });
});
