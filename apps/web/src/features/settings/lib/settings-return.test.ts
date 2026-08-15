import { afterEach, describe, expect, test } from "bun:test";

import {
  __resetSettingsReturnPathForTests,
  findSettingsReturnHref,
  isSettingsPathname,
  rememberSettingsReturnPath,
  resolveSettingsReturnHref,
  resolveStoredSettingsReturnPath,
} from "./settings-return";

afterEach(() => {
  __resetSettingsReturnPathForTests();
});

describe("settings return href", () => {
  test("treats trailing slashes as the settings route", () => {
    expect(isSettingsPathname("/settings")).toBe(true);
    expect(isSettingsPathname("/settings/")).toBe(true);
    expect(isSettingsPathname("/project")).toBe(false);
  });

  test("skips stacked settings history and returns the last app href", () => {
    expect(
      resolveSettingsReturnHref(
        [
          { url: "https://app.atmos.local/" },
          { url: "https://app.atmos.local/project?id=p1" },
          { url: "https://app.atmos.local/settings?activeSettingTab=about" },
          { url: "https://app.atmos.local/settings?activeSettingTab=workspace" },
        ],
        "https://app.atmos.local",
      ),
    ).toBe("/project?id=p1");
  });

  test("falls back to home when history is only settings", () => {
    expect(
      resolveSettingsReturnHref(
        [
          { url: "https://app.atmos.local/settings?activeSettingTab=layout" },
          { url: "https://app.atmos.local/settings?activeSettingTab=about" },
        ],
        "https://app.atmos.local",
      ),
    ).toBe("/");
    expect(
      findSettingsReturnHref(
        [
          { url: "https://app.atmos.local/settings?activeSettingTab=layout" },
          { url: "https://app.atmos.local/settings?activeSettingTab=about" },
        ],
        "https://app.atmos.local",
      ),
    ).toBeNull();
  });

  test("keeps the last workbench path when later settings URLs are ignored", () => {
    rememberSettingsReturnPath("/project?id=proj-1&lsTab=files");
    rememberSettingsReturnPath("/settings?activeSettingTab=about");
    rememberSettingsReturnPath("/settings?activeSettingTab=workspace");

    expect(resolveStoredSettingsReturnPath()).toBe("/project?id=proj-1&lsTab=files");
  });
});
