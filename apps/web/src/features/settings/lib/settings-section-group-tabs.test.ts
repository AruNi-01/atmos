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
    expect(getSettingsSectionGroupTabs("workspace")).toEqual(["workspace", "labels"]);
    expect(getSettingsSectionGroupTabs("remote-access")).toEqual([
      "atmos-computer",
      "tunnel-connector",
    ]);
    expect(getSettingsSectionGroupTabs("general")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("editor")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("canvas")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("integrations")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("browser")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("desktop-use")).toBeUndefined();
    expect(getSettingsSectionGroupTabs("interface")).toBeUndefined();
  });

  test("prefers a valid hash over the default group", () => {
    expect(resolveSettingsGroupTab("remote-access", "tunnel-connector")).toBe("tunnel-connector");
    expect(resolveSettingsGroupTab("remote-access", "missing", "atmos-computer")).toBe(
      "atmos-computer",
    );
    expect(resolveSettingsGroupTab("remote-access", "")).toBe("atmos-computer");
    expect(resolveSettingsGroupTab("keyboard", "tunnel-connector")).toBeNull();
  });

  test("remembers the last group tab in memory", () => {
    rememberSettingsGroupTab("remote-access", "tunnel-connector");
    expect(peekLastSettingsGroupTab("remote-access")).toBe("tunnel-connector");
    expect(resolveSettingsGroupTab("remote-access", "")).toBe("tunnel-connector");
    expect(resolveSettingsGroupTab("remote-access", "atmos-computer")).toBe("atmos-computer");
  });

  test("maps search items onto the owning group tab", () => {
    expect(settingsGroupTabFromTranslationKey("desktopUse.cli")).toBeNull();
    expect(settingsGroupTabFromTranslationKey("atmosComputer.thisComputer")).toBe(
      "atmos-computer",
    );
    expect(
      settingsGroupTabForSearchItem({
        sectionId: "remote-access",
        translationKey: "tunnelConnector.providers",
      }),
    ).toBe("tunnel-connector");
    expect(
      settingsGroupTabForSearchItem({
        sectionId: "browser",
        translationKey: "browser.cookiesImport",
      }),
    ).toBeNull();
    expect(settingsGroupTabLabelKey("atmos-computer")).toBe("sections.atmosComputer.label");
  });

  test("treats other pages' group hashes as foreign", () => {
    expect(isForeignSettingsGroupTabHash("interface", "tunnel-connector")).toBe(true);
    expect(isForeignSettingsGroupTabHash("remote-access", "tunnel-connector")).toBe(false);
    expect(isForeignSettingsGroupTabHash("interface", "browser")).toBe(false);
    expect(isForeignSettingsGroupTabHash("interface", "sidebar")).toBe(false);
  });

  test("maps in-page search onto the matching group", () => {
    expect(resolveSettingsGroupTabFromSearch("remote-access", "private relay")).toBe(
      "atmos-computer",
    );
    expect(resolveSettingsGroupTabFromSearch("remote-access", "cloudflare")).toBe(
      "tunnel-connector",
    );
    expect(resolveSettingsGroupTabFromSearch("interface", "launchpad")).toBeNull();
  });
});
