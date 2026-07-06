// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  agentNeedsTuiFollowUp,
  getTerminalAgentTuiFollowUpConfig,
  isAgentTuiReady,
  listTerminalAgentTuiFollowUpAgentIds,
} from "@/features/agent/lib/terminal-agent-tui-follow-up";

describe("terminal-agent-tui-follow-up config", () => {
  it("loads Hermes from the shared manifest", () => {
    expect(listTerminalAgentTuiFollowUpAgentIds()).toContain("hermes");
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
  });
});
