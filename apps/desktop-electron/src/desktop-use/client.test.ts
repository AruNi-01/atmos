import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI_NOT_INSTALLED_CODE,
  CLI_UPDATE_REQUIRED_CODE,
  canonicalAtmosCliPath,
  enrichCliStatusWithRequirement,
  isAtmosCliInstalled,
  probeAtmosCli,
  resolveAtmosCliPath,
  resolveCliRequirementPath,
  resolveDesktopUseManifestPath,
  versionGt,
  DESKTOP_USE_MANIFEST_ENV,
} from "./client.ts";

describe("desktop-use client", () => {
  it("resolves only the canonical ~/.atmos/bin path", () => {
    const path = resolveAtmosCliPath({ home: "/Users/test" });
    expect(path).toBe(join("/Users/test", ".atmos", "bin", "atmos"));
    expect(path).toBe(canonicalAtmosCliPath({ home: "/Users/test" }));
    expect(path.toLowerCase()).not.toContain("cua");
    expect(path.toLowerCase()).not.toContain("trycua");
    expect(path).not.toContain("Resources");
    expect(path).not.toContain("target");
  });

  it("does not use App Resources or monorepo target as CLI sources", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-cli-"));
    const binDir = join(root, "runtime", "current", "bin");
    mkdirSync(binDir, { recursive: true });
    const binName = process.platform === "win32" ? "atmos.exe" : "atmos";
    writeFileSync(join(binDir, binName), "#!/bin/sh\n");
    // Even with a staged packaged binary, resolve stays on canonical home path.
    const resolved = resolveAtmosCliPath({ home: join(root, "fake-home") });
    expect(resolved).toBe(
      join(root, "fake-home", ".atmos", "bin", binName),
    );
    expect(isAtmosCliInstalled({ home: join(root, "fake-home") })).toBe(false);
  });

  it("probe reports cli_not_installed when missing", async () => {
    const home = mkdtempSync(join(tmpdir(), "atmos-du-probe-"));
    const probe = await probeAtmosCli({ home });
    expect(probe.installed).toBe(false);
    expect(probe.code).toBe(CLI_NOT_INSTALLED_CODE);
    expect(probe.path).toBe(canonicalAtmosCliPath({ home }));
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

  it("versionGt matches dotted numeric order", () => {
    expect(versionGt("2026.8.10", "2026.8.7")).toBe(true);
    expect(versionGt("2026.8.7", "2026.8.10")).toBe(false);
    expect(versionGt("2026.8.7", "2026.8.7")).toBe(false);
  });

  it("CLI requirement: only prompts update when below package min", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-cli-req-"));
    const du = join(root, "desktop-use");
    mkdirSync(du, { recursive: true });
    const reqPath = join(du, "cli-requirement.json");
    writeFileSync(
      reqPath,
      JSON.stringify({ schema_version: 1, min_cli_version: "2026.8.10" }),
    );
    expect(
      resolveCliRequirementPath({ resourcesPath: root, repoRoot: null }),
    ).toBe(reqPath);

    const below = enrichCliStatusWithRequirement(
      {
        installed: true,
        path: "/x",
        version: "2026.8.7",
      },
      { resourcesPath: root, repoRoot: null },
    );
    expect(below.update_required).toBe(true);
    expect(below.meets_requirement).toBe(false);
    expect(below.code).toBe(CLI_UPDATE_REQUIRED_CODE);
    expect(below.min_cli_version).toBe("2026.8.10");

    const ok = enrichCliStatusWithRequirement(
      {
        installed: true,
        path: "/x",
        version: "2026.8.10",
      },
      { resourcesPath: root, repoRoot: null },
    );
    expect(ok.update_required).toBe(false);
    expect(ok.meets_requirement).toBe(true);

    const newer = enrichCliStatusWithRequirement(
      {
        installed: true,
        path: "/x",
        version: "2026.9.1",
      },
      { resourcesPath: root, repoRoot: null },
    );
    // Newer than min is fine — no "channel has a still-newer CLI" prompt.
    expect(newer.update_required).toBe(false);
    expect(newer.meets_requirement).toBe(true);
  });
});
