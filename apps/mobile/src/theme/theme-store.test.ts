// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { resolveMobileThemePreference } from "./theme-preference";

describe("mobile theme preference", () => {
  test("uses explicit light or dark preference before the system scheme", () => {
    expect(resolveMobileThemePreference("light", "dark")).toBe("light");
    expect(resolveMobileThemePreference("dark", "light")).toBe("dark");
  });

  test("falls back to light when system preference is unset", () => {
    expect(resolveMobileThemePreference("system", null)).toBe("light");
  });

  test("follows the system scheme when requested", () => {
    expect(resolveMobileThemePreference("system", "dark")).toBe("dark");
    expect(resolveMobileThemePreference("system", "light")).toBe("light");
  });
});
