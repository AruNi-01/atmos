import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const items = readFileSync(
  join(import.meta.dir, "../global-search-app-items.tsx"),
  "utf8",
);
const parts = readFileSync(
  join(import.meta.dir, "../global-search-parts.tsx"),
  "utf8",
);
const content = readFileSync(
  join(import.meta.dir, "../global-search-content.tsx"),
  "utf8",
);

describe("global search app items", () => {
  it("uses the shared Quick Open catalog instead of a forked APP_MAP", () => {
    expect(items).toContain("QUICK_OPEN_APP_OPTIONS");
    expect(items).toContain("QuickOpenAppIcon");
    expect(items).not.toContain("APP_MAP");
    expect(parts).not.toContain("export const APP_MAP");
  });

  it("keeps settings sections and setting rows search-only", () => {
    expect(items).toContain("SETTINGS_SEARCH_SECTIONS");
    expect(items).toContain("searchOnly: true");
    expect(items.match(/searchOnly: true/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not toast on successful Quick Open", () => {
    expect(items).not.toContain("quickOpen.toast.successTitle");
    expect(items).toContain("quickOpen.toast.failedTitle");
  });

  it("always lists launchpad destinations and ACP chat", () => {
    expect(items).not.toContain("launchpadTerminalsEnabled");
    expect(items).not.toContain("launchpadAgentsEnabled");
    expect(items).not.toContain("automationsEnabled");
    expect(items).toContain("modal-chat-panel");
    expect(items).toContain("launchpad-terminals");
  });

  it("adds workspace surfaces, notes, language, and sidebar commands", () => {
    expect(parts).toContain('"surface"');
    expect(parts).toContain('"command"');
    expect(parts).toContain('"note"');
    expect(content).toContain('key: "surface"');
    expect(content).toContain('key: "command"');
    expect(content).toContain("NoteSubView");
    expect(items).toContain("language-en");
    expect(items).toContain("toggle-sidebar");
    expect(items).toContain("surface-wiki");
    expect(items).toContain("surface-browser");
    expect(items).toContain("note-current-workspace");
    expect(items).toContain("QUICK_OPEN_APP_OPTIONS");
  });
});
