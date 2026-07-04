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
    expect(getInteractiveAgentParams(agent("antigravity"))).toBe("--dangerously-skip-permissions");
  });

  it("uses Cursor yolo alias for interactive terminal commands", () => {
    expect(getInteractiveAgentParams(agent("cursor"))).toBe("--yolo");
    expect(
      buildInteractiveAgentCommand({
        agentId: "cursor",
        launchCommand: "agent --yolo",
        prompt: "fix this",
      }),
    ).toBe("agent --yolo 'fix this'");
  });

  it("maps saved non-interactive default flags back to interactive params", () => {
    expect(
      getInteractiveAgentParams(agent("codex"), "exec --json --dangerously-bypass-approvals-and-sandbox"),
    ).toBe("--dangerously-bypass-approvals-and-sandbox");
    expect(getInteractiveAgentParams(agent("pi"), "-p")).toBe("");
    expect(
      getInteractiveAgentParams(agent("openclaw"), "agent --agent main --local --json --message"),
    ).toBe("agent --agent main --local");
    expect(getInteractiveAgentParams(agent("hermes"), "chat --yolo -q")).toBe("chat --yolo");
    expect(
      getInteractiveAgentParams(agent("antigravity"), "--dangerously-skip-permissions --output-format stream-json -p"),
    ).toBe("--dangerously-skip-permissions");
  });

  it("builds Codex terminal prompts with the interactive command", () => {
    expect(buildCommand("codex", "fix this")).toBe(
      "codex --dangerously-bypass-approvals-and-sandbox 'fix this'",
    );
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

  it("starts OpenClaw workspace prompts without the automation json flag", () => {
    expect(
      buildInteractiveAgentCommand({
        agentId: "openclaw",
        launchCommand: "openclaw agent --agent main --local",
        prompt: "fix this",
      }),
    ).toBe("openclaw agent --agent main --local --message 'fix this'");
  });

  it("starts OpenCode workspace prompts with the interactive prompt flag", () => {
    expect(
      buildInteractiveAgentCommand({
        agentId: "opencode",
        launchCommand: "opencode",
        prompt: "fix this",
      }),
    ).toBe("opencode --prompt 'fix this'");
  });

  it("starts Antigravity workspace prompts with the interactive prompt flag", () => {
    expect(
      buildInteractiveAgentCommand({
        agentId: "antigravity",
        launchCommand: "agy --dangerously-skip-permissions",
        prompt: "fix this",
      }),
    ).toBe("agy --dangerously-skip-permissions --prompt-interactive 'fix this'");
  });
});
