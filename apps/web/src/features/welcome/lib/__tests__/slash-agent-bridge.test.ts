import { describe, expect, it } from "bun:test";
import {
  AGENT_BRIDGE_SLASH_COMMAND_ID,
  buildAgentBridgeSlashCommand,
  matchesAgentBridgeSlashQuery,
  resolveAgentBridgeSkillRef,
} from "@/features/welcome/lib/slash-agent-bridge";
import type { SkillInfo } from "@/api/ws-api";

describe("slash-agent-bridge", () => {
  it("matches agent bridge queries", () => {
    expect(matchesAgentBridgeSlashQuery("")).toBe(true);
    expect(matchesAgentBridgeSlashQuery("agent")).toBe(true);
    expect(matchesAgentBridgeSlashQuery("bridge")).toBe(true);
    expect(matchesAgentBridgeSlashQuery("xyz")).toBe(false);
  });

  it("builds command option", () => {
    const cmd = buildAgentBridgeSlashCommand({
      label: "Agent Bridge",
      description: "desc",
    });
    expect(cmd.id).toBe(AGENT_BRIDGE_SLASH_COMMAND_ID);
    expect(cmd.label).toBe("Agent Bridge");
  });

  it("resolves skill path from catalog or fallback", () => {
    const skill = {
      id: "x",
      name: "atmos-agent-bridge",
      path: "/Users/me/.atmos/skills/.system/atmos-agent-bridge",
    } as SkillInfo;
    expect(resolveAgentBridgeSkillRef([skill]).absolutePath).toContain("atmos-agent-bridge");
    expect(resolveAgentBridgeSkillRef([]).absolutePath).toContain(".system/atmos-agent-bridge");
  });
});
