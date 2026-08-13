import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PINNED_HELPER_VERSION } from "./pin.ts";

export type HelperResolveOk = {
  dir: string;
  source: "env" | "resources" | "dev";
  version: string;
};

export type HelperResolveFail = {
  code: "helper_missing";
};

export type HelperManifest = {
  helper?: string;
  version?: string;
  tarball_sha256?: string;
};

export function readHelperManifest(dir: string): HelperManifest | null {
  const candidates = [
    join(dir, "..", "helper-manifest.json"),
    join(dir, "helper-manifest.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as HelperManifest;
    } catch {
      return null;
    }
  }
  return null;
}

export function isHelperPayloadPresent(dir: string): boolean {
  return existsSync(join(dir, "dist", "serve-sim.js"));
}

export function resolveHelperDir(opts: {
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
  repoRoot?: string | null;
}): HelperResolveOk | HelperResolveFail {
  const env = opts.env ?? process.env;

  const override = env.ATMOS_SIMULATOR_HELPER_DIR?.trim();
  if (override) {
    if (isHelperPayloadPresent(override)) {
      return {
        dir: override,
        source: "env",
        version: readHelperManifest(override)?.version || PINNED_HELPER_VERSION,
      };
    }
    return { code: "helper_missing" };
  }

  const resourcesPath = opts.resourcesPath?.trim() || "";
  if (resourcesPath) {
    const packaged = join(resourcesPath, "simulator-helper", "serve-sim");
    if (isHelperPayloadPresent(packaged)) {
      return {
        dir: packaged,
        source: "resources",
        version:
          readHelperManifest(packaged)?.version || PINNED_HELPER_VERSION,
      };
    }
  }

  if (env.ATMOS_SIMULATOR_DEV === "1" && opts.repoRoot) {
    const dev = join(opts.repoRoot, "node_modules", "@expo", "serve-sim");
    if (isHelperPayloadPresent(dev)) {
      return {
        dir: dev,
        source: "dev",
        version: PINNED_HELPER_VERSION,
      };
    }
  }

  return { code: "helper_missing" };
}

export function assertHelperVersion(
  resolved: HelperResolveOk,
  expected = PINNED_HELPER_VERSION,
): void {
  const manifest = readHelperManifest(resolved.dir);
  const version = manifest?.version || resolved.version;
  if (version !== expected) {
    throw new Error(
      `helper version mismatch: found ${version}, expected ${expected}`,
    );
  }
}
