// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  getParityPreviewThemeOverride,
  nativeColorSchemeToApply,
  parityPreviewThemeOverride,
  parityPreviewThemeSource,
  resetParityPreviewThemeOverride,
  setParityPreviewThemeOverride,
  subscribeParityPreviewTheme,
} from "./parity-preview-theme";

const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  resetParityPreviewThemeOverride();
});

describe("parity preview theme override", () => {
  test("query-pin and carousel skip native appearance; disk-pin may apply it", () => {
    expect(parityPreviewThemeSource({ queryPin: true, diskPin: false })).toBe("query");
    expect(parityPreviewThemeSource({ queryPin: false, diskPin: true })).toBe("disk");
    expect(parityPreviewThemeSource({ queryPin: false, diskPin: false })).toBe("carousel");
    expect(parityPreviewThemeOverride("dark", "query").nativeAppearance).toBe(false);
    expect(parityPreviewThemeOverride("dark", "carousel").nativeAppearance).toBe(false);
    expect(parityPreviewThemeOverride("dark", "disk").nativeAppearance).toBe(true);
  });

  test("openurl dark does not call Appearance.setColorScheme", () => {
    expect(nativeColorSchemeToApply(parityPreviewThemeOverride("dark", "query"))).toBeNull();
    expect(nativeColorSchemeToApply(parityPreviewThemeOverride("dark", "carousel"))).toBeNull();
  });

  test("disk-pin applies the override scheme even when the store is still light", () => {
    expect(nativeColorSchemeToApply(parityPreviewThemeOverride("dark", "disk"))).toBe("dark");
    expect(nativeColorSchemeToApply(parityPreviewThemeOverride("light", "disk"))).toBe("light");
  });

  test("settings preference never selects a native color scheme", () => {
    expect(nativeColorSchemeToApply(null)).toBeNull();
  });

  test("subscribers see the session override and a reset clears it", () => {
    const seen: Array<string | null> = [];
    const stop = subscribeParityPreviewTheme(() => {
      seen.push(getParityPreviewThemeOverride()?.colorScheme ?? null);
    });
    setParityPreviewThemeOverride(parityPreviewThemeOverride("dark", "query"));
    expect(getParityPreviewThemeOverride()).toEqual({
      colorScheme: "dark",
      nativeAppearance: false,
    });
    setParityPreviewThemeOverride(parityPreviewThemeOverride("dark", "query"));
    resetParityPreviewThemeOverride();
    expect(getParityPreviewThemeOverride()).toBeNull();
    stop();
    expect(seen).toEqual(["dark", null]);
  });

  test("preview-chat pins a session override and never writes the persisted store", () => {
    const preview = readFileSync(
      join(here, "../features/agent-chat/preview-chat-screen.tsx"),
      "utf8",
    );
    const providers = readFileSync(join(here, "../providers/AppProviders.tsx"), "utf8");
    const store = readFileSync(join(here, "theme-store.ts"), "utf8");
    expect(preview).toContain("setParityPreviewThemeOverride");
    expect(preview).toContain("parityPreviewThemeSource");
    expect(preview).not.toContain("setPreference");
    expect(preview).not.toContain("useThemeStore");
    expect(preview).toContain("preview?.colorScheme !== frame.theme");
    expect(providers).toContain("nativeColorSchemeToApply(getParityPreviewThemeOverride())");
    expect(providers).toContain("if (next != null)");
    expect(providers).not.toContain("preference: theme.preference");
    const settings = readFileSync(
      join(here, "../features/settings/SettingsIndexScreen.tsx"),
      "utf8",
    );
    const account = readFileSync(
      join(here, "../features/onboarding/AccountPopoverButton.tsx"),
      "utf8",
    );
    expect(settings).toContain("theme.setPreference");
    expect(settings).not.toContain("Appearance");
    expect(account).toContain("theme.setPreference");
    expect(account).not.toContain("Appearance");
    expect(store).toContain("getParityPreviewThemeOverride");
    expect(store).toContain("preview?.colorScheme");
  });
});
