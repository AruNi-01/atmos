import { afterEach, describe, expect, test } from "bun:test";

import {
  __resetSettingsGroupTabMemoryForTests,
  getSettingsSectionGroupTabs,
  isForeignSettingsGroupTabHash,
  peekLastSettingsGroupTab,
  rememberSettingsGroupTab,
  resolveSettingsGroupTab,
  resolveSettingsGroupTabFromSearch,
  settingsGroupTabFromTranslationKey,
  settingsGroupTabForSearchItem,
  settingsGroupTabLabelKey,
} from "./settings-section-group-tabs";

afterEach(() => {
  __resetSettingsGroupTabMemoryForTests();
});

describe("settings section group tabs", () => {
  test("splits stacked pages into named groups", () => {
    expect(getSettingsSectionGroupTabs("apps")).toEqual([
      "integrations",
      "browser",
      "desktop-use",
    ]);
    expect(getSettingsSectionGroupTabs("remote-access")).toEqual([
      "atmos-computer",
      "tunnel-connector",
    ]);
    expect(getSettingsSectionGroupTabs("general")).toEqual([
      "appearance",
      "about",
      "experiments",
    ]);
    expect(getSettingsSectionGroupTabs("interface")).toBeUndefined();
  });

  test("prefers a valid hash over the default group", () => {
    expect(resolveSettingsGroupTab("apps", "browser")).toBe("browser");
    expect(resolveSettingsGroupTab("apps", "missing", "desktop-use")).toBe("desktop-use");
    expect(resolveSettingsGroupTab("apps", "")).toBe("integrations");
    expect(resolveSettingsGroupTab("keyboard", "browser")).toBeNull();
  });

  test("remembers the last group tab in memory", () => {
    rememberSettingsGroupTab("apps", "desktop-use");
    expect(peekLastSettingsGroupTab("apps")).toBe("desktop-use");
    expect(resolveSettingsGroupTab("apps", "")).toBe("desktop-use");
    expect(resolveSettingsGroupTab("apps", "browser")).toBe("browser");
  });

  test("maps search items onto the owning group tab", () => {
    expect(settingsGroupTabFromTranslationKey("desktopUse.cli")).toBe("desktop-use");
    expect(settingsGroupTabFromTranslationKey("atmosComputer.thisComputer")).toBe(
      "atmos-computer",
    );
    expect(
      settingsGroupTabForSearchItem({
        sectionId: "apps",
        translationKey: "browser.cookiesImport",
      }),
    ).toBe("browser");
    expect(settingsGroupTabLabelKey("atmos-computer")).toBe("sections.atmosComputer.label");
  });

  test("treats other pages' group hashes as foreign", () => {
    expect(isForeignSettingsGroupTabHash("interface", "browser")).toBe(true);
    expect(isForeignSettingsGroupTabHash("apps", "browser")).toBe(false);
    expect(isForeignSettingsGroupTabHash("interface", "sidebar")).toBe(false);
  });

  test("maps in-page search onto the matching group", () => {
    expect(resolveSettingsGroupTabFromSearch("apps", "cookies")).toBe("browser");
    expect(resolveSettingsGroupTabFromSearch("apps", "desktop use")).toBe("desktop-use");
    expect(resolveSettingsGroupTabFromSearch("interface", "launchpad")).toBeNull();
  });
});
