import { describe, expect, it } from "bun:test";
import { getAgentIconCandidates } from "@/features/agent/lib/agent-icon-candidates";

describe("agent icon candidates", () => {
  it("maps DeepSeek Harness onto the local DeepSeek brand asset", () => {
    expect(getAgentIconCandidates("deepseek-harness")).toEqual([
      "/agents/deepseek.svg",
    ]);
  });
});
