// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { buildInteractiveAgentCommand } from "@/features/agent/lib/terminal-agent-run-config";
import { AGENT_OPTIONS, buildCommand, getInteractiveAgentParams } from "../AgentSelect";

function agent(id: string) {
  const found = AGENT_OPTIONS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing built-in agent ${id}`);
  return found;
}

describe("getInteractiveAgentParams", () => {
  it("honors empty interactive params instead of falling back to automation params", () => {
    expect(getInteractiveAgentParams(agent("pi"))).toBe("");
  });

  it("uses interactive params for agents with prompt-flag automation commands", () => {
    expect(getInteractiveAgentParams(agent("openclaw"))).toBe("agent --agent main --local");
    expect(getInteractiveAgentParams(agent("hermes"))).toBe("chat --yolo");
  });

  it("maps saved non-interactive default flags back to interactive params", () => {
    expect(getInteractiveAgentParams(agent("pi"), "-p")).toBe("");
    expect(
      getInteractiveAgentParams(agent("openclaw"), "agent --agent main --local --json --message"),
    ).toBe("agent --agent main --local");
    expect(getInteractiveAgentParams(agent("hermes"), "chat --yolo -q")).toBe("chat --yolo");
  });

  it("builds Hermes one-shot prompts with the documented query flag", () => {
    expect(buildCommand("hermes", "fix this")).toBe("hermes chat --yolo -q 'fix this'");
  });

  it("starts Hermes workspace prompts with the documented query flag", () => {
    expect(
      buildInteractiveAgentCommand({
        agentId: "hermes",
        launchCommand: "hermes chat --yolo",
        prompt: "fix this",
      }),
    ).toBe("hermes chat --yolo -q 'fix this'");
  });
});
