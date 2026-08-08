import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DESKTOP_USE_MANIFEST_ENV,
  resolveAtmosCliPath,
  resolveDesktopUseManifestPath,
} from "./client.ts";

describe("desktop-use client", () => {
  it("resolves an atmos CLI path string without vendor names", () => {
    const path = resolveAtmosCliPath();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path.toLowerCase()).not.toContain("cua");
    expect(path.toLowerCase()).not.toContain("trycua");
  });

  it("prefers packaged resources CLI when packaged", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-cli-"));
    const binDir = join(root, "runtime", "current", "bin");
    mkdirSync(binDir, { recursive: true });
    const binName = process.platform === "win32" ? "atmos.exe" : "atmos";
    const staged = join(binDir, binName);
    writeFileSync(staged, "#!/bin/sh\n");
    const resolved = resolveAtmosCliPath({
      resourcesPath: root,
      packaged: true,
      repoRoot: null,
    });
    expect(resolved).toBe(staged);
  });

  it("resolves App Resources engine-manifest as pin authority", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-man-"));
    const du = join(root, "desktop-use");
    mkdirSync(du, { recursive: true });
    const man = join(du, "engine-manifest.json");
    writeFileSync(man, JSON.stringify({ engine_version: "9.9.9" }));
    const prev = process.env[DESKTOP_USE_MANIFEST_ENV];
    delete process.env[DESKTOP_USE_MANIFEST_ENV];
    try {
      const resolved = resolveDesktopUseManifestPath({
        resourcesPath: root,
        repoRoot: null,
      });
      expect(resolved).toBe(man);
    } finally {
      if (prev === undefined) delete process.env[DESKTOP_USE_MANIFEST_ENV];
      else process.env[DESKTOP_USE_MANIFEST_ENV] = prev;
    }
  });
});
