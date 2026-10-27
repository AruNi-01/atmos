import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dto = readFileSync(join(here, "agent-bridge.ts"), "utf8");
const actions = readFileSync(join(here, "../actions.ts"), "utf8");
const session = readFileSync(join(here, "agent-status.ts"), "utf8");

describe("agent-bridge does not own the session directory", () => {
  it("leaves listing to agent_session_status_list", () => {
    expect(dto).not.toContain("export type AgentBridgeListRequest");
    expect(actions).not.toContain('"agent_bridge_list"');
    expect(actions).toContain('"agent_session_status_list"');
    expect(session).toContain("provider_ids?: string[] | null");
    expect(session).toContain("agents?: SessionAgentOption[] | null");
  });
});
