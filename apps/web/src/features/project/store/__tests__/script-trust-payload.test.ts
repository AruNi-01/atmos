// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  isWorkspaceSetupProgressEventPayload,
  type WorkspaceSetupProgressEventPayload,
} from "@/features/project/store/project-store-setup-progress";

function payload(
  overrides: Partial<WorkspaceSetupProgressEventPayload> = {},
): Record<string, unknown> {
  return {
    workspace_id: "ws-1",
    status: "setting_up",
    step_key: "run_setup_script",
    step_title: "Review Setup Script",
    success: true,
    ...overrides,
  };
}

describe("workspace setup progress script-trust wire shape", () => {
  it("accepts the parked-for-review payload the server sends", () => {
    const data = payload({
      requires_script_trust: true,
      script_project_guid: "project-1",
      script_hash: "a".repeat(64),
      output: '{"setup":"bun install"}',
    });

    expect(isWorkspaceSetupProgressEventPayload(data)).toBe(true);
  });

  it("still accepts payloads from a server that predates script trust", () => {
    expect(isWorkspaceSetupProgressEventPayload(payload())).toBe(true);
  });

  it("rejects a non-boolean requires_script_trust so a bad frame cannot imply trust", () => {
    const data = payload({ requires_script_trust: "yes" as unknown as boolean });
    expect(isWorkspaceSetupProgressEventPayload(data)).toBe(false);
  });
});
