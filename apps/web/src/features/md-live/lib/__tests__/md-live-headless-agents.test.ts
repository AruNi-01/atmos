import { describe, expect, test } from "bun:test";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { agentSupportsHeadless, filterHeadlessAgents } from "../md-live-headless-agents";

describe("md-live headless agents", () => {
  test("built-in catalog agents support headless", () => {
    expect(TERMINAL_AGENT_DEFINITIONS.length).toBeGreaterThan(0);
    expect(agentSupportsHeadless(TERMINAL_AGENT_DEFINITIONS[0]!.id)).toBe(true);
  });

  test("unknown and custom ids are excluded", () => {
    expect(agentSupportsHeadless("not-a-real-agent")).toBe(false);
    expect(
      filterHeadlessAgents([
        { id: "codex" },
        { id: "my-custom-bot" },
      ]).map((agent) => agent.id),
    ).toEqual(["codex"]);
  });
});
