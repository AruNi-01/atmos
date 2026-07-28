import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  helperProbe,
  listImportableBrowsers,
  resolveBrowserCookiesHelper,
} from "./service.ts";

describe("atmos-browser-cookies helper resolution", () => {
  it("prefers packaged resources/bin over cargo", () => {
    const root = mkdtempSync(join(tmpdir(), "cookie-helper-"));
    try {
      const binDir = join(root, "bin");
      mkdirSync(binDir, { recursive: true });
      const fake = join(binDir, "atmos-browser-cookies");
      writeFileSync(fake, "#!/bin/sh\necho ok\n", { mode: 0o755 });
      const h = resolveBrowserCookiesHelper({
        resourcesPath: root,
        repoRoot: join(root, "empty-repo"),
        allowCargo: false,
        platform: "darwin",
      });
      expect(h.mode).toBe("bin");
      expect(h.source).toBe("resources/bin");
      expect(h.path).toBe(fake);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not use cargo as production path when helper missing", () => {
    const root = mkdtempSync(join(tmpdir(), "cookie-missing-"));
    try {
      const h = resolveBrowserCookiesHelper({
        resourcesPath: join(root, "no-resources"),
        repoRoot: join(root, "no-repo"),
        allowCargo: false,
        platform: "darwin",
      });
      expect(h.mode).toBe("missing");
      expect(h.path).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves real monorepo/release bin when present", () => {
    const probe = helperProbe();
    expect(probe.length).toBeGreaterThan(0);
    const h = resolveBrowserCookiesHelper();
    // Production path must be bin when target/release exists in this workspace
    if (h.mode === "bin") {
      expect(existsSync(h.path)).toBe(true);
      expect(h.source).not.toBe("cargo-fallback");
    } else if (h.mode === "missing") {
      // Accept missing in clean CI without building helper — document
      expect(h.source).toBe("missing");
    } else {
      // cargo only if explicitly allowed
      expect(process.env.ATMOS_ALLOW_CARGO_COOKIE_HELPER).toBe("1");
    }
  });

  it(
    "list profiles via real helper on macOS (or UnsupportedPlatform)",
    () => {
      if (process.platform !== "darwin") {
        expect(() => listImportableBrowsers()).toThrow();
        return;
      }
      const h = resolveBrowserCookiesHelper();
      if (h.mode === "missing") {
        // Skip functional list when helper not built; resolution test covers path.
        return;
      }
      try {
        const profiles = listImportableBrowsers();
        expect(Array.isArray(profiles)).toBe(true);
        for (const p of profiles) {
          expect(typeof p.profile_handle).toBe("string");
          expect(p.profile_handle.length).toBeGreaterThan(0);
          expect(["Chrome", "Edge", "Brave", "Firefox"]).toContain(p.browser);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
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
