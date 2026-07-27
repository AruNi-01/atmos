import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  helperProbe,
  listImportableBrowsers,
  resolveBrowserCookiesHelper,
} from "./service.ts";

describe("atmos-browser-cookies helper integration", () => {
  it("resolves helper path (bin or cargo)", () => {
    const probe = helperProbe();
    expect(probe.length).toBeGreaterThan(0);
    const h = resolveBrowserCookiesHelper();
    if (h.mode === "bin") {
      expect(existsSync(h.path)).toBe(true);
    } else {
      expect(h.path).toBe("cargo");
      expect(h.argsPrefix).toContain("atmos-browser-cookies");
    }
  });

  it(
    "list profiles via real helper on macOS (or UnsupportedPlatform)",
    () => {
      if (process.platform !== "darwin") {
        expect(() => listImportableBrowsers()).toThrow();
        return;
      }
      // May prompt Keychain in rare cases; list_profiles is read-only discovery.
      try {
        const profiles = listImportableBrowsers();
        expect(Array.isArray(profiles)).toBe(true);
        for (const p of profiles) {
          expect(typeof p.profile_handle).toBe("string");
          expect(p.profile_handle.length).toBeGreaterThan(0);
          expect(["Chrome", "Edge", "Brave", "Firefox"]).toContain(p.browser);
        }
      } catch (e) {
        // Helper missing / not built yet — fail with actionable message
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        // If UnsupportedPlatform ok; Io means build helper
        if (typeof e === "object" && e && "code" in e) {
          const code = (e as { code: string }).code;
          if (code === "UnsupportedPlatform") return;
        }
        throw new Error(
          `listImportableBrowsers failed: ${msg}. Build with: cargo build -p browser-cookies --bin atmos-browser-cookies`,
        );
      }
    },
    120_000,
  );
});
