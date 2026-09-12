// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  agentNeedsTuiFollowUp,
  getTerminalAgentTuiFollowUpConfig,
  isAgentTuiReady,
  looksLikeDirectoryTrustPrompt,
  listTerminalAgentTuiFollowUpAgentIds,
} from "@/features/agent/lib/terminal-agent-tui-follow-up";
import builtinAgents from "@atmos/resources/terminal-agents/builtin_agents.json";

describe("terminal-agent-tui-follow-up config", () => {
  it("loads Hermes from the shared manifest", () => {
    expect(listTerminalAgentTuiFollowUpAgentIds()).toContain("hermes");
    expect(listTerminalAgentTuiFollowUpAgentIds()).toContain("codex");
    expect(getTerminalAgentTuiFollowUpConfig("hermes")).toEqual({
      agentId: "hermes",
      readyPattern: "❯",
    });
  });

  it("requires a configured agent and non-empty prompt", () => {
    expect(agentNeedsTuiFollowUp("hermes", "fix this")).toBe(true);
    expect(agentNeedsTuiFollowUp("hermes", "   ")).toBe(false);
    expect(agentNeedsTuiFollowUp("claude", "fix this")).toBe(false);
  });

  it("detects ready state from the configured pattern", () => {
    expect(isAgentTuiReady("hermes", "booting...\n❯ ")).toBe(true);
    expect(isAgentTuiReady("hermes", "still loading")).toBe(false);
    expect(isAgentTuiReady("claude", "❯ ")).toBe(false);
    expect(
      looksLikeDirectoryTrustPrompt("Do you trust this directory?\n1. Yes"),
    ).toBe(true);
    expect(
      isAgentTuiReady("codex", "Do you trust this directory?\nAsk Codex"),
    ).toBe(false);
    expect(isAgentTuiReady("codex", "Ask Codex to do anything")).toBe(true);
  });

  it("ships directory-trust flags on interactive agent CLIs that have them", () => {
    const byId = Object.fromEntries(
      (builtinAgents as Array<{ id: string; interactiveParams?: string; yoloInteractiveParams?: string }>).map(
        (agent) => [agent.id, agent],
      ),
    );
    expect(byId.gemini.interactiveParams).toBe("--skip-trust");
    expect(byId.gemini.yoloInteractiveParams).toBe("--yolo --skip-trust");
    expect(byId.cursor.interactiveParams).toBe("--trust");
    expect(byId.cursor.yoloInteractiveParams).toBe("--yolo --trust");
    expect(byId.commandcode.interactiveParams).toContain("--trust");
    expect(byId.pi.interactiveParams).toBe("--approve");
  });
});
