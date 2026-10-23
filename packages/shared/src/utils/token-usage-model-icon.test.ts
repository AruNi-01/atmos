import { describe, expect, test } from "bun:test";

import {
  inferProviderIdFromModel,
  primaryProviderSegment,
  resolveTokenUsageModelIconRef,
} from "./token-usage-model-icon";

describe("resolveTokenUsageModelIconRef", () => {
  test("maps anthropic / openai / google providers to ai-provider assets", () => {
    expect(resolveTokenUsageModelIconRef("anthropic", "claude-opus-4")).toEqual({
      kind: "ai-provider",
      id: "claude",
    });
    expect(resolveTokenUsageModelIconRef("openai", "gpt-5")).toEqual({
      kind: "ai-provider",
      id: "codex",
    });
    expect(resolveTokenUsageModelIconRef("google", "gemini-2.5-pro")).toEqual({
      kind: "ai-provider",
      id: "gemini",
    });
    expect(resolveTokenUsageModelIconRef("xai", "grok-3")).toEqual({
      kind: "ai-provider",
      id: "grok",
    });
    expect(resolveTokenUsageModelIconRef("moonshotai", "kimi-k2.5")).toEqual({
      kind: "ai-provider",
      id: "kimi",
    });
  });

  test("infers provider from model id when provider is missing", () => {
    expect(resolveTokenUsageModelIconRef(null, "claude-sonnet-4")).toEqual({
      kind: "ai-provider",
      id: "claude",
    });
    expect(resolveTokenUsageModelIconRef("", "gpt-4.1")).toEqual({
      kind: "ai-provider",
      id: "codex",
    });
    expect(resolveTokenUsageModelIconRef(undefined, "gemini-2.0-flash")).toEqual({
      kind: "ai-provider",
      id: "gemini",
    });
  });

  test("handles merged provider ids and agent-icon fallbacks", () => {
    expect(primaryProviderSegment("openai, anthropic")).toBe("openai");
    expect(resolveTokenUsageModelIconRef("openai, anthropic", "gpt-4o")).toEqual({
      kind: "ai-provider",
      id: "codex",
    });
    expect(resolveTokenUsageModelIconRef("qwen", "qwen3-coder")).toEqual({
      kind: "agent",
      id: "qwen-code",
    });
    expect(resolveTokenUsageModelIconRef("mistral", "mistral-large")).toEqual({
      kind: "agent",
      id: "mistral-vibe",
    });
  });

  test("maps deepseek / minimax / zai onto ai-provider assets", () => {
    expect(resolveTokenUsageModelIconRef("deepseek", "deepseek-r1")).toEqual({
      kind: "ai-provider",
      id: "deepseek",
    });
    expect(inferProviderIdFromModel("deepseek-r1")).toBe("deepseek");
    expect(resolveTokenUsageModelIconRef("minimax", "minimax-m1")).toEqual({
      kind: "ai-provider",
      id: "minimax",
    });
    expect(resolveTokenUsageModelIconRef("zai", "glm-4")).toEqual({
      kind: "ai-provider",
      id: "zai",
    });
  });

  test("returns none for unknown families", () => {
    expect(resolveTokenUsageModelIconRef("mystery", "some-local-model")).toEqual({ kind: "none" });
  });
});
