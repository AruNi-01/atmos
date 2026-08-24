import { afterEach, describe, expect, test } from "bun:test";

import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "@/features/settings/components/settings-modal-data";
import { __resetSettingsGroupTabMemoryForTests, rememberSettingsGroupTab } from "./settings-section-group-tabs";
import {
  DEFAULT_SETTINGS_TAB,
  __resetLastSettingsTabForTests,
  peekLastSettingsTab,
  rememberSettingsTab,
  resolveSettingsTab,
  settingsHref,
} from "./settings-last-section";

afterEach(() => {
  __resetLastSettingsTabForTests();
  __resetSettingsGroupTabMemoryForTests();
});

describe("settings last section", () => {
  test("defaults to the first sidebar item", () => {
    expect(DEFAULT_SETTINGS_TAB).toBe(SETTINGS_SECTIONS[0].id);
    expect(DEFAULT_SETTINGS_TAB).toBe(SETTINGS_GROUPS[0].items[0]);
    expect(DEFAULT_SETTINGS_TAB).toBe("general");
    expect(resolveSettingsTab()).toBe("general");
    expect(resolveSettingsTab(null)).toBe("general");
  });

  test("remembers the last section in memory only", () => {
    rememberSettingsTab("terminal");
    expect(peekLastSettingsTab()).toBe("terminal");
    expect(resolveSettingsTab()).toBe("terminal");
    expect(resolveSettingsTab(null)).toBe("terminal");
  });

  test("prefers an explicit tab over the remembered section", () => {
    rememberSettingsTab("terminal");
    expect(resolveSettingsTab("models")).toBe("models");
    expect(peekLastSettingsTab()).toBe("terminal");
  });

  test("ignores invalid tabs", () => {
    rememberSettingsTab("interface");
    rememberSettingsTab("not-a-tab" as never);
    expect(peekLastSettingsTab()).toBe("interface");
    expect(resolveSettingsTab("nope" as never)).toBe("interface");
  });
});

describe("settingsHref", () => {
  test("opens the first settings item when nothing was remembered", () => {
    expect(settingsHref()).toBe("/settings?activeSettingTab=general");
  });

  test("reopens the last visited section", () => {
    rememberSettingsTab("keyboard");
    expect(settingsHref()).toBe("/settings?activeSettingTab=keyboard");
  });

  test("keeps explicit deep links and remembers them", () => {
    rememberSettingsTab("keyboard");
    expect(settingsHref("models")).toBe("/settings?activeSettingTab=models");
    expect(settingsHref()).toBe("/settings?activeSettingTab=models");
  });

  test("restores the last group tab hash when reopening a section", () => {
    rememberSettingsTab("general");
    rememberSettingsGroupTab("general", "about");
    expect(settingsHref()).toBe("/settings?activeSettingTab=general#about");
    expect(settingsHref("apps", "desktop-use")).toBe("/settings?activeSettingTab=apps#desktop-use");
    expect(settingsHref("apps")).toBe("/settings?activeSettingTab=apps#desktop-use");
  });
});
