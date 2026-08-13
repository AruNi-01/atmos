import { describe, expect, it } from "bun:test";
import {
  dropClaims,
  dropClaimsHeldBy,
  releaseClaim,
  takeOverClaim,
  tryAcquireClaim,
} from "./claims.ts";
import type { SimulatorClaim } from "./types.ts";

function claim(
  workspaceId: string,
  instanceId: string,
  desktopPid: number,
  since: string,
): SimulatorClaim {
  return { workspaceId, instanceId, desktopPid, since };
}

describe("simulator claims", () => {
  it("refuses a second workspace with simulator_in_use and the holder", () => {
    const first = tryAcquireClaim({}, "SIM-1", claim("ws-a", "inst-1", 11, "t0"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = tryAcquireClaim(first.table, "SIM-1", claim("ws-b", "inst-1", 11, "t1"));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("simulator_in_use");
    expect(second.holder.workspaceId).toBe("ws-a");
    expect(second.holder.desktopPid).toBe(11);
  });

  it("take-over replaces the holder", () => {
    const first = tryAcquireClaim({}, "SIM-1", claim("ws-a", "inst-1", 11, "t0"));
    if (!first.ok) throw new Error("expected claim");
    const taken = takeOverClaim(first.table, "SIM-1", claim("ws-b", "inst-2", 22, "t1"));
    expect(taken.previous?.workspaceId).toBe("ws-a");
    expect(taken.table["SIM-1"]?.workspaceId).toBe("ws-b");
    expect(taken.table["SIM-1"]?.desktopPid).toBe(22);
    const released = releaseClaim(taken.table, "SIM-1", "ws-b");
    expect(released["SIM-1"]).toBeUndefined();
  });

  it("dropClaimsHeldBy keeps rows owned by another live process", () => {
    const table = {
      "SIM-1": claim("ws-a", "inst-self", 11, "t0"),
      "SIM-2": claim("ws-b", "inst-other", 22, "t1"),
    };
    const next = dropClaimsHeldBy(table, { instanceId: "inst-self", desktopPid: 11 });
    expect(next["SIM-1"]).toBeUndefined();
    expect(next["SIM-2"]?.workspaceId).toBe("ws-b");
    expect(dropClaims(table, ["SIM-2"])["SIM-1"]?.desktopPid).toBe(11);
  });
});
