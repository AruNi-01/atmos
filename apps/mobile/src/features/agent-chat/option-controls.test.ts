// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentOptionsSnapshot } from "@atmos/api-types/ws/dto/agent-chat";
import { composerControls, modelThinkingChip, thinkingLevelLabel } from "./option-controls";

function snapshot(partial: Partial<AgentOptionsSnapshot> = {}): AgentOptionsSnapshot {
  return {
    agent_id: "codex",
    status: "ok",
    models: [],
    modes: [],
    thinking: { type: "none" },
    strategies_used: [],
    fetched_at: "2026-09-25T00:00:00Z",
    source: "live",
    message: null,
    ...partial,
  };
}

describe("composerControls", () => {
  test("omits thinking when the snapshot has no selectable levels", () => {
    expect(composerControls(null).map((control) => control.id)).toEqual(["agent"]);
    expect(composerControls(snapshot()).map((control) => control.id)).toEqual(["agent"]);
    expect(composerControls(snapshot({
      thinking: { type: "enum", options: [] },
    })).some((control) => control.id === "thinking")).toBe(false);
    expect(composerControls(snapshot({
      thinking: { type: "enum", options: ["  "] },
    })).some((control) => control.id === "thinking")).toBe(false);
    expect(composerControls(snapshot({
      thinking: { type: "encoded_in_model" },
    })).some((control) => control.id === "thinking")).toBe(false);
  });

  test("includes model, thinking, mode, and permission when they have choices", () => {
    expect(composerControls(snapshot({
      models: [{ id: "gpt-5", label: "GPT-5" }],
      thinking: { type: "enum", options: ["low", "high"] },
      modes: [{ id: "ask", label: "Ask" }],
      permission_modes: [{ id: "default", label: "Default" }],
    })).map((control) => control.id)).toEqual([
      "agent",
      "model",
      "thinking",
      "mode",
      "permission",
    ]);
  });

  test("model chip joins the thinking level the way web does", () => {
    expect(thinkingLevelLabel("xhigh")).toBe("Extra high");
    expect(thinkingLevelLabel("extra_high")).toBe("Extra high");
    expect(modelThinkingChip("grok-4.6", "Extra high")).toBe("grok-4.6 · Extra high");
    expect(modelThinkingChip("grok-4.6", "")).toBe("grok-4.6");
  });
});
