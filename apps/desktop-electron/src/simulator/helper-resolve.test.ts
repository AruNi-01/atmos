import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertHelperVersion,
  resolveHelperDir,
} from "./helper-resolve.ts";
import { PINNED_HELPER_VERSION } from "./pin.ts";

function fakePayload(root: string): string {
  const dir = join(root, "serve-sim");
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "serve-sim.js"), "#!/usr/bin/env node\n");
  writeFileSync(
    join(root, "helper-manifest.json"),
    JSON.stringify({ helper: "@expo/serve-sim", version: PINNED_HELPER_VERSION }),
  );
  return dir;
}

describe("helper resolve", () => {
  it("prefers ATMOS_SIMULATOR_HELPER_DIR", () => {
    const root = mkdtempSync(join(tmpdir(), "sim-helper-env-"));
    try {
      const dir = fakePayload(root);
      const resolved = resolveHelperDir({
        env: { ATMOS_SIMULATOR_HELPER_DIR: dir },
        resourcesPath: "/missing",
        repoRoot: null,
      });
      expect(resolved).toMatchObject({ dir, source: "env" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves packaged resources next", () => {
    const root = mkdtempSync(join(tmpdir(), "sim-helper-res-"));
    try {
      const packagedRoot = join(root, "simulator-helper");
      const dir = fakePayload(packagedRoot);
      const resolved = resolveHelperDir({
        env: {},
        resourcesPath: root,
        repoRoot: null,
      });
      expect(resolved).toMatchObject({ dir, source: "resources" });
      if ("dir" in resolved) assertHelperVersion(resolved);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns helper_missing when nothing is present", () => {
    const resolved = resolveHelperDir({
      env: {},
      resourcesPath: "/nope",
      repoRoot: null,
    });
    expect(resolved).toEqual({ code: "helper_missing" });
  });
});
