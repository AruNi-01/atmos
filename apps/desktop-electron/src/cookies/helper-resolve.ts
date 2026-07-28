/**
 * Pure path resolution for atmos-browser-cookies (no Electron imports).
 * Shared by runtime cookie service and prepare-package staging.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type CookieHelperCandidate = { path: string; source: string };

const COMMON_TRIPLES = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc",
  "aarch64-pc-windows-msvc",
] as const;

/**
 * Host triples + env overrides used by CI (`--target ${{ matrix.target }}`).
 * cargo writes to target/<triple>/release when --target is set.
 */
export function resolveCargoTargetTriples(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const fromEnv = [
    env.ATMOS_CARGO_TARGET,
    env.CARGO_BUILD_TARGET,
    env.CARGO_TARGET,
  ].filter((v): v is string => Boolean(v && v.trim()));

  const triples = new Set<string>([...fromEnv, ...COMMON_TRIPLES]);
  return [...triples];
}

export function cookieHelperBinName(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? "atmos-browser-cookies.exe"
    : "atmos-browser-cookies";
}

/**
 * Ordered candidates: packaged resources first, then host target/release,
 * then target/<triple>/release (CI cross/matrix builds), then debug.
 */
export function listCookieHelperCandidates(opts: {
  repoRoot: string;
  binName?: string;
  resourcesPath?: string;
  packageResourcesBin?: string;
  cargoTargets?: string[];
  env?: NodeJS.ProcessEnv;
}): CookieHelperCandidate[] {
  const binName = opts.binName ?? cookieHelperBinName();
  const env = opts.env ?? process.env;
  const targets = opts.cargoTargets ?? resolveCargoTargetTriples(env);
  const out: CookieHelperCandidate[] = [];

  const resourcesPath = opts.resourcesPath ?? "";
  if (resourcesPath) {
    out.push(
      { path: join(resourcesPath, "bin", binName), source: "resources/bin" },
      {
        path: join(resourcesPath, "helpers", binName),
        source: "resources/helpers",
      },
      {
        path: join(resourcesPath, "runtime", "current", "bin", binName),
        source: "resources/runtime/bin",
      },
    );
  }

  if (opts.packageResourcesBin) {
    out.push({
      path: join(opts.packageResourcesBin, binName),
      source: "package-resources/bin",
    });
  }

  const repoRoot = opts.repoRoot;
  // Host default layout (cargo build --release without --target)
  out.push(
    {
      path: join(repoRoot, "target/release", binName),
      source: "target/release",
    },
    {
      path: join(repoRoot, "target/debug", binName),
      source: "target/debug",
    },
  );

  for (const triple of targets) {
    out.push(
      {
        path: join(repoRoot, "target", triple, "release", binName),
        source: `target/${triple}/release`,
      },
      {
        path: join(repoRoot, "target", triple, "debug", binName),
        source: `target/${triple}/debug`,
      },
    );
  }

  // Scan target/*/release for unexpected triples (future CI targets)
  try {
    const targetRoot = join(repoRoot, "target");
    if (existsSync(targetRoot)) {
      for (const ent of readdirSync(targetRoot, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        if (ent.name === "release" || ent.name === "debug") continue;
        if (targets.includes(ent.name)) continue;
        const releaseBin = join(targetRoot, ent.name, "release", binName);
        out.push({
          path: releaseBin,
          source: `target/${ent.name}/release`,
        });
      }
    }
  } catch {
    /* ignore scan errors */
  }

  return out;
}

export function findCookieHelperBinary(opts: {
  repoRoot: string;
  binName?: string;
  resourcesPath?: string;
  packageResourcesBin?: string;
  cargoTargets?: string[];
  env?: NodeJS.ProcessEnv;
}): CookieHelperCandidate | null {
  for (const c of listCookieHelperCandidates(opts)) {
    if (existsSync(c.path)) return c;
  }
  return null;
}
