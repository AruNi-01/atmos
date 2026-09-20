// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { agentNotifyToastKind } from "../agent-status-toast";

describe("agentNotifyToastKind", () => {
  it("uses the occupancy notify intent when present", () => {
    expect(
      agentNotifyToastKind({ reason: "permission_request", state: "permission_request" }),
    ).toBe("permission");
    expect(agentNotifyToastKind({ reason: "task_complete", state: "idle" })).toBe("complete");
  });

  it("falls back to occupancy for old payloads without reason", () => {
    expect(agentNotifyToastKind({ state: "permission_request" })).toBe("permission");
    expect(agentNotifyToastKind({ state: "idle" })).toBe("complete");
    expect(agentNotifyToastKind({ state: "running" })).toBeNull();
  });

  it("does not treat idle as complete when reason is explicitly something else", () => {
    expect(
      agentNotifyToastKind({ reason: "permission_request", state: "idle" }),
    ).toBe("permission");
  });
});

describe("use-agent-notifications", () => {
  it("renders toasts from agent_notification instead of occupancy diffs", () => {
    const src = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-notifications.tsx"),
      "utf8",
    );
    expect(src).toContain('onEvent("agent_notification"');
    expect(src).toContain("app_toast_notification");
    expect(src).toContain("showAgentStatusToast");
    expect(src).not.toContain('onEvent("agent_status_changed"');
    expect(src).not.toContain("previousAgentOccupancyRef");
    expect(src).not.toContain("notifyOnTaskComplete");
  });
});
