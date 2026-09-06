import { describe, expect, it } from "bun:test";
import {
  lastNewChatConfigForAgent,
  mergeLastNewChatConfigs,
  pickInstalledRegistryId,
  preferredConfigFromDefault,
} from "@/features/agent/lib/agent-chat-prefs";

describe("agent chat prefs", () => {
  it("reads last New Chat snapshot including mode permission and fast", () => {
    expect(preferredConfigFromDefault(undefined)).toEqual({
      modelId: "",
      thinkingId: "",
      modeId: "",
      permissionModeId: "",
      fastId: "",
    });
    expect(
      preferredConfigFromDefault({
        models: "opus",
        thought_level: "high",
        mode: "plan",
        permission_mode: "yolo",
        fast: "true",
      }),
    ).toEqual({
      modelId: "opus",
      thinkingId: "high",
      modeId: "plan",
      permissionModeId: "yolo",
      fastId: "true",
    });
    expect(
      preferredConfigFromDefault({
        model: "codex",
        thinking: "medium",
        thought_level: "high",
      }),
    ).toEqual({
      modelId: "codex",
      thinkingId: "medium",
      modeId: "",
      permissionModeId: "",
      fastId: "",
    });
  });

  it("only restores a last agent that is still installed", () => {
    expect(pickInstalledRegistryId(["claude", "codex"], " claude ")).toBe("claude");
    expect(pickInstalledRegistryId(["claude", "codex"], "gemini")).toBe("");
    expect(pickInstalledRegistryId([], "claude")).toBe("claude");
    expect(pickInstalledRegistryId(["claude"], "  ")).toBe("");
    expect(pickInstalledRegistryId(["codex", "claude"], "codex-acp")).toBe("codex");
  });

  it("resolves last New Chat config by agent id with kinship fold", () => {
    const configs = {
      cursor: { model: "gpt-5", mode: "agent" },
      claude: { model: "opus" },
    };
    expect(lastNewChatConfigForAgent(configs, "cursor")?.model).toBe("gpt-5");
    expect(lastNewChatConfigForAgent(configs, "claude-code")?.model).toBe("opus");
    expect(lastNewChatConfigForAgent(configs, "missing")).toBeUndefined();
  });

  it("lets local landing snapshots win over stale disk Auto", () => {
    expect(
      mergeLastNewChatConfigs(
        { cursor: { model: "composer-2.5", thinking: "high" } },
        { cursor: { model: "auto" }, claude: { model: "opus" } },
      ),
    ).toEqual({
      cursor: { model: "composer-2.5", thinking: "high" },
      claude: { model: "opus" },
    });
  });
});
