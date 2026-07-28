import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findCookieHelperBinary,
  listCookieHelperCandidates,
  resolveCargoTargetTriples,
} from "./helper-resolve.ts";

describe("cookie helper path resolution (CI triple layout)", () => {
  it("includes ATMOS_CARGO_TARGET triple release path before scan", () => {
    const triples = resolveCargoTargetTriples({
      ATMOS_CARGO_TARGET: "aarch64-apple-darwin",
    });
    expect(triples[0]).toBe("aarch64-apple-darwin");

    const candidates = listCookieHelperCandidates({
      repoRoot: "/repo",
      binName: "atmos-browser-cookies",
      cargoTargets: ["x86_64-unknown-linux-gnu"],
      env: {},
    });
    const sources = candidates.map((c) => c.source);
    expect(sources).toContain("target/x86_64-unknown-linux-gnu/release");
    expect(
      candidates.some((c) =>
        c.path.includes("target/x86_64-unknown-linux-gnu/release/atmos-browser-cookies"),
      ),
    ).toBe(true);
  });

  it("finds helper under target/<triple>/release (CI matrix layout)", () => {
    const root = mkdtempSync(join(tmpdir(), "cookie-triple-"));
    try {
      const triple = "aarch64-apple-darwin";
      const binDir = join(root, "target", triple, "release");
      mkdirSync(binDir, { recursive: true });
      const bin = join(binDir, "atmos-browser-cookies");
      writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });

      const found = findCookieHelperBinary({
        repoRoot: root,
        binName: "atmos-browser-cookies",
        cargoTargets: [triple],
        env: { ATMOS_CARGO_TARGET: triple },
      });
      expect(found).not.toBeNull();
      expect(found!.path).toBe(bin);
      expect(found!.source).toBe(`target/${triple}/release`);
      expect(existsSync(found!.path)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers resources/bin over cargo target layout", () => {
    const root = mkdtempSync(join(tmpdir(), "cookie-pref-"));
    try {
      const resBin = join(root, "resources", "bin");
      mkdirSync(resBin, { recursive: true });
      const packaged = join(resBin, "atmos-browser-cookies");
      writeFileSync(packaged, "pkg", { mode: 0o755 });

      const tripleDir = join(root, "target", "aarch64-apple-darwin", "release");
      mkdirSync(tripleDir, { recursive: true });
      writeFileSync(join(tripleDir, "atmos-browser-cookies"), "triple", {
        mode: 0o755,
      });

      const found = findCookieHelperBinary({
        repoRoot: root,
        resourcesPath: join(root, "resources"),
        cargoTargets: ["aarch64-apple-darwin"],
      });
      expect(found?.path).toBe(packaged);
      expect(found?.source).toBe("resources/bin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
