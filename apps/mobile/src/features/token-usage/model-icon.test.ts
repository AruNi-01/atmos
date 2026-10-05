// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { resolveTokenUsageModelIcon } from "./model-icon";

describe("resolveTokenUsageModelIcon", () => {
  test("maps provider ids onto the same Agent icons web uses", () => {
    expect(resolveTokenUsageModelIcon("anthropic", "claude-opus-4")).toEqual({ kind: "agent", agentId: "claude" });
    expect(resolveTokenUsageModelIcon("openai", "gpt-5")).toEqual({ kind: "agent", agentId: "codex" });
    expect(resolveTokenUsageModelIcon("google", "gemini-2.5-pro")).toEqual({ kind: "agent", agentId: "gemini" });
    expect(resolveTokenUsageModelIcon("xai", "grok-3")).toEqual({ kind: "agent", agentId: "grok" });
    expect(resolveTokenUsageModelIcon("moonshotai", "kimi-k2.5")).toEqual({ kind: "agent", agentId: "kimi" });
  });

  test("infers the provider from the model id when tokscale left it empty", () => {
    expect(resolveTokenUsageModelIcon(null, "claude-sonnet-4")).toEqual({ kind: "agent", agentId: "claude" });
    expect(resolveTokenUsageModelIcon("", "gpt-4.1")).toEqual({ kind: "agent", agentId: "codex" });
    expect(resolveTokenUsageModelIcon(undefined, "gemini-2.0-flash")).toEqual({ kind: "agent", agentId: "gemini" });
    expect(resolveTokenUsageModelIcon(undefined, "grok-4.6")).toEqual({ kind: "agent", agentId: "grok" });
  });

  test("handles merged provider ids and agent-only fallbacks", () => {
    expect(resolveTokenUsageModelIcon("openai, anthropic", "gpt-4o")).toEqual({ kind: "agent", agentId: "codex" });
    expect(resolveTokenUsageModelIcon("qwen", "qwen3-coder")).toEqual({ kind: "agent", agentId: "qwen-code" });
    expect(resolveTokenUsageModelIcon("mistral", "mistral-large")).toEqual({ kind: "agent", agentId: "mistral-vibe" });
  });

  test("uses a provider glyph when mobile has no Agent icon for that brand", () => {
    expect(resolveTokenUsageModelIcon("deepseek", "deepseek-r1")).toEqual({ kind: "provider", providerId: "deepseek" });
    expect(resolveTokenUsageModelIcon("minimax", "minimax-m1")).toEqual({ kind: "provider", providerId: "minimax" });
    expect(resolveTokenUsageModelIcon("zai", "glm-4")).toEqual({ kind: "provider", providerId: "zai" });
  });

  test("matches web fallbacks for other and unknown models", () => {
    expect(resolveTokenUsageModelIcon("anthropic", "other")).toEqual({ kind: "other" });
    expect(resolveTokenUsageModelIcon("mystery", "some-local-model")).toEqual({ kind: "unknown" });
  });
});
