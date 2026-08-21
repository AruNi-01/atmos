// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  formatAutomationAgentConfigSuffix,
  formatAutomationAgentDisplayName,
  formatAutomationReasoningLabel,
} from "@/features/automations/lib/automation-format";

describe("automation agent display", () => {
  it("sentence-cases simple reasoning tokens", () => {
    expect(formatAutomationReasoningLabel("high")).toBe("High");
    expect(formatAutomationReasoningLabel("xhigh")).toBe("Xhigh");
    expect(formatAutomationReasoningLabel("medium")).toBe("Medium");
  });

  it("keeps mixed-case or punctuated reasoning values", () => {
    expect(formatAutomationReasoningLabel("High")).toBe("High");
    expect(formatAutomationReasoningLabel("effort/high")).toBe("effort/high");
  });

  it("formats agent - model - reasoning when both are set", () => {
    expect(
      formatAutomationAgentDisplayName("Grok Build", {
        model: "grok-4",
        reasoning: { value: "high" },
      }),
    ).toBe("Grok Build - grok-4 - High");
  });

  it("omits missing model or reasoning parts", () => {
    expect(
      formatAutomationAgentDisplayName("Claude Code", {
        model: "claude-sonnet-4-5",
      }),
    ).toBe("Claude Code - claude-sonnet-4-5");
    expect(
      formatAutomationAgentDisplayName("Claude Code", {
        reasoning: { value: "medium" },
      }),
    ).toBe("Claude Code - Medium");
  });

  it("returns the agent name when no model or reasoning is configured", () => {
    expect(formatAutomationAgentDisplayName("Grok Build", null)).toBe("Grok Build");
    expect(formatAutomationAgentDisplayName("Grok Build", { extra_args: ["--foo"] } as never)).toBe(
      "Grok Build",
    );
    expect(formatAutomationAgentConfigSuffix(null)).toBeNull();
  });

  it("reads persisted agent_config_json", () => {
    expect(
      formatAutomationAgentDisplayName(
        "Grok Build",
        JSON.stringify({ model: "grok-4-fast", reasoning: { mode: "manual", value: "high" } }),
      ),
    ).toBe("Grok Build - grok-4-fast - High");
  });
});
