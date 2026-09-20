import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hook = readFileSync(
  join(import.meta.dir, "../use-agent-chat-favorites.ts"),
  "utf8",
);

describe("agent chat favorites persist through ~/.atmos prefs", () => {
  it("hydrates from prefsGet and writes prefsSet, not browser agent prefs", () => {
    expect(hook).toContain("hydrateFavoriteModelsFromPrefs");
    expect(hook).toContain("favoriteModelsFromWire(prefs.favorite_models)");
    expect(hook).toContain(".prefsSet({ favorite_models:");
    expect(hook).not.toContain("useAgentUiPrefs");
    expect(hook).not.toContain("patchAgentPrefs");
    expect(hook).not.toContain("peekLegacyBrowserFavoriteModels");
    expect(hook).not.toContain("clearLegacyBrowserFavoriteModels");
  });
});
