import { describe, expect, it } from "bun:test";
import {
  AGENT_CHAT_FAVORITES_TAB,
  favoriteModelKey,
  favoriteModelsFromWire,
  favoriteModelsToWire,
  isFavoriteModel,
  orderFavoriteModels,
  parseFavoriteModels,
  resolveFavoriteModelLabel,
  toggleFavoriteModel,
} from "@/features/agent/lib/agent-chat-favorites";

describe("agent chat favorites", () => {
  it("keeps a stable favorites-tab token for the agent rail", () => {
    expect(AGENT_CHAT_FAVORITES_TAB).toBe("__favorites__");
  });

  it("parses and de-duplicates favorite rows", () => {
    expect(
      parseFavoriteModels([
        { agentId: "claude", model: "opus", label: "Opus" },
        { agentId: " claude ", model: " opus ", label: "Opus 4" },
        { agentId: "", model: "sonnet" },
        { model: "haiku" },
        "nope",
      ]),
    ).toEqual([{ agentId: "claude", model: "opus", label: "Opus" }]);
  });

  it("maps prefs wire rows at the ~/.atmos boundary", () => {
    expect(
      favoriteModelsFromWire([
        { agent_id: "claude", model: "opus", label: "Opus" },
        { agent_id: "claude", model: "opus", label: "Opus 4" },
      ]),
    ).toEqual([{ agentId: "claude", model: "opus", label: "Opus" }]);
    expect(
      favoriteModelsToWire([{ agentId: "claude", model: "opus", label: "Opus" }]),
    ).toEqual([{ agent_id: "claude", model: "opus", label: "Opus" }]);
  });

  it("toggles a favorite on and off without disturbing other rows", () => {
    const current = [{ agentId: "codex", model: "gpt-5", label: "GPT-5" }];
    const added = toggleFavoriteModel(current, {
      agentId: "claude",
      model: "opus",
      label: "Opus",
    });
    expect(added).toEqual([
      { agentId: "codex", model: "gpt-5", label: "GPT-5" },
      { agentId: "claude", model: "opus", label: "Opus" },
    ]);
    expect(
      toggleFavoriteModel(added, { agentId: "claude", model: "opus", label: "Opus" }),
    ).toEqual(current);
  });

  it("groups favorites by the installed agent order, then leftovers", () => {
    expect(
      orderFavoriteModels(
        [
          { agentId: "codex", model: "gpt-5", label: "GPT-5" },
          { agentId: "claude", model: "opus", label: "Opus" },
          { agentId: "gone", model: "old", label: "Old" },
        ],
        [{ id: "claude" }, { id: "codex" }],
      ).map((item) => favoriteModelKey(item.agentId, item.model)),
    ).toEqual([
      favoriteModelKey("claude", "opus"),
      favoriteModelKey("codex", "gpt-5"),
      favoriteModelKey("gone", "old"),
    ]);
  });

  it("prefers a live catalog label over the stored snapshot", () => {
    expect(
      resolveFavoriteModelLabel(
        { agentId: "claude", model: "opus", label: "Opus" },
        [{ id: "opus", label: "Claude Opus 4.1" }],
      ),
    ).toBe("Claude Opus 4.1");
    expect(
      isFavoriteModel(
        [{ agentId: "claude", model: "opus", label: "Opus" }],
        "claude",
        "opus",
      ),
    ).toBe(true);
  });
});
