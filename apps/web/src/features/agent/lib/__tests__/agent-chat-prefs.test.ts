import { describe, expect, it } from "bun:test";
import {
  pickInstalledRegistryId,
  preferredConfigFromDefault,
} from "@/features/agent/lib/agent-chat-prefs";

describe("agent chat prefs", () => {
  it("reads last-used model and thinking from default_config aliases", () => {
    expect(preferredConfigFromDefault(undefined)).toEqual({
      modelId: "",
      thinkingId: "",
    });
    expect(
      preferredConfigFromDefault({
        models: "opus",
        thought_level: "high",
      }),
    ).toEqual({ modelId: "opus", thinkingId: "high" });
    expect(
      preferredConfigFromDefault({
        model: "codex",
        thinking: "medium",
        thought_level: "high",
      }),
    ).toEqual({ modelId: "codex", thinkingId: "medium" });
  });

  it("only restores a last agent that is still installed", () => {
    expect(pickInstalledRegistryId(["claude", "codex"], " claude ")).toBe("claude");
    expect(pickInstalledRegistryId(["claude", "codex"], "gemini")).toBe("");
    expect(pickInstalledRegistryId([], "claude")).toBe("claude");
    expect(pickInstalledRegistryId(["claude"], "  ")).toBe("");
    expect(pickInstalledRegistryId(["codex", "claude"], "codex-acp")).toBe("codex");
  });
});
