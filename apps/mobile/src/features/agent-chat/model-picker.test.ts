// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentOptionsSnapshot } from "@atmos/api-types/ws/dto/agent-chat";
import {
  buildComposerPicker,
  composerTriggerLabel,
  effortChipLabel,
  favoriteModelsFromUnknown,
  isFastOn,
  toggleFavoriteModel,
} from "./model-picker";

function snapshot(partial: Partial<AgentOptionsSnapshot> = {}): AgentOptionsSnapshot {
  return {
    agent_id: "grok",
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

describe("composer picker", () => {
  test("trigger matches the web model and effort chip", () => {
    expect(composerTriggerLabel({
      modelLabel: "grok-4.7",
      thinkingLabel: "Extra high",
      agentLabel: "Grok",
    })).toBe("grok-4.7 · Extra high");
    expect(effortChipLabel("Extra high", true)).toBe("Extra high · Fast");
    expect(isFastOn("true")).toBe(true);
    expect(isFastOn("off")).toBe(false);
  });

  test("favorites round-trip the prefs wire and toggle", () => {
    const parsed = favoriteModelsFromUnknown([
      { agent_id: "grok", model: "grok-4.7", label: "Grok 4.7" },
    ]);
    expect(parsed).toEqual([{ agentId: "grok", model: "grok-4.7", label: "Grok 4.7" }]);
    expect(toggleFavoriteModel(parsed, parsed[0]!).map((item) => item.model)).toEqual([]);
  });

  test("fast and effort come from the selected model", () => {
    const picker = buildComposerPicker({
      agents: [{ id: "grok", label: "Grok", iconUrl: null }],
      agentId: "grok",
      options: snapshot({
        models: [{ id: "grok-4.7", label: "grok-4.7", fast: true, is_default: true }],
        thinking: { type: "enum", options: ["low", "xhigh"] },
        modes: [{ id: "default", label: "Default", is_default: true }],
        permission_modes: [{ id: "yolo", label: "Yolo" }],
      }),
      modelId: null,
      thinkingId: "xhigh",
      modeId: null,
      permissionId: null,
      fastId: "true",
      contextId: null,
    });
    expect(picker.triggerLabel).toBe("grok-4.7 · Extra high");
    expect(picker.fastAvailable).toBe(true);
    expect(picker.fastEnabled).toBe(true);
    expect(picker.effortLabel).toBe("Extra high · Fast");
    expect(picker.modeLabel).toBe("Default");
    expect(picker.permissionLabel).toBe("Yolo");
  });
});
