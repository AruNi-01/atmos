import { describe, expect, it } from "bun:test";
import {
  resolveFollowupPolicy,
  routeBusySubmit,
  oneShotAction,
} from "@/features/agent/lib/followup-policy";

describe("S12 follow-up policy", () => {
  it("defaults to queue and routes busy Enter globally", () => {
    expect(resolveFollowupPolicy(undefined)).toBe("queue");
    expect(resolveFollowupPolicy(null)).toBe("queue");
    expect(routeBusySubmit({ policy: "queue" })).toBe("queue");
    expect(oneShotAction("queue")).toBe("steer");
    expect(routeBusySubmit({ policy: "steer" })).toBe("steer");
    expect(oneShotAction("steer")).toBe("queue");
    expect(routeBusySubmit({ policy: "queue", oneShot: "steer" })).toBe("steer");
  });
});
