import { describe, expect, test } from "bun:test";
import {
  AGENT_TO_QUOTA_PROVIDER_IDS,
  AGENT_UNLINKED_QUOTA_PROVIDER_IDS,
  QUOTA_USAGE_ONBOARDING_PROVIDERS,
  quotaProviderIdsForChatAgent,
  usageProviderIdsForAgents,
} from "@/features/quota-usage/lib/agent-quota-provider-map";

describe("usageProviderIdsForAgents", () => {
  test("maps known agents to usage providers", () => {
    const ids = usageProviderIdsForAgents(["claude", "droid", "grok-build", "deepseek-harness", "grok"]);
    expect(ids.has("claude")).toBe(true);
    expect(ids.has("factory")).toBe(true);
    expect(ids.has("grok")).toBe(true);
    expect(ids.has("deepseek")).toBe(true);
    expect(ids.size).toBe(4);
  });

  test("ignores agents without a usage provider", () => {
    const ids = usageProviderIdsForAgents(["pi", "hermes", "devin"]);
    expect(ids.size).toBe(0);
  });

  test("dedupes providers when multiple agents map to the same provider", () => {
    // Currently 1:1, but mapping values are arrays — ensure Set semantics.
    const agentIds = Object.keys(AGENT_TO_QUOTA_PROVIDER_IDS);
    const ids = usageProviderIdsForAgents([...agentIds, ...agentIds]);
    expect(ids.size).toBe(
      new Set(Object.values(AGENT_TO_QUOTA_PROVIDER_IDS).flat()).size,
    );
  });
});

describe("quotaProviderIdsForChatAgent", () => {
  const canonicalize = (id: string) => {
    if (id === "claude-acp" || id === "claude-code") return "claude";
    if (id === "grok-build") return "grok";
    return id;
  };

  test("resolves exact and family ids", () => {
    expect([...quotaProviderIdsForChatAgent("claude", canonicalize)]).toEqual(["claude"]);
    expect([...quotaProviderIdsForChatAgent("claude-acp", canonicalize)]).toEqual(["claude"]);
    expect([...quotaProviderIdsForChatAgent("grok", canonicalize)]).toEqual(["grok"]);
    expect([...quotaProviderIdsForChatAgent("pi", canonicalize)]).toEqual([]);
  });
});

describe("QUOTA_USAGE_ONBOARDING_PROVIDERS", () => {
  test("includes agent-mapped and unlinked providers", () => {
    const ids = new Set(QUOTA_USAGE_ONBOARDING_PROVIDERS.map((p) => p.id));
    for (const mapped of Object.values(AGENT_TO_QUOTA_PROVIDER_IDS).flat()) {
      expect(ids.has(mapped)).toBe(true);
    }
    for (const unlinked of AGENT_UNLINKED_QUOTA_PROVIDER_IDS) {
      expect(ids.has(unlinked)).toBe(true);
    }
  });

  test("has unique ids", () => {
    const ids = QUOTA_USAGE_ONBOARDING_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
