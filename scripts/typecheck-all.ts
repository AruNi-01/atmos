#!/usr/bin/env bun
/**
 * Unified TypeScript 7 typecheck orchestrator (QUALITY-005).
 *
 * Uses the native Go `tsc` from `@typescript/native` (linked as `.bin/tsc` when
 * that package is installed alongside `typescript@6` for the programmatic API).
 *
 * Env:
 *   ATMOS_TSC_CHECKERS          default 8 locally, 2 in CI
 *   ATMOS_TSC_BUILDERS          default 4 locally, 2 in CI (only with -b)
 *   ATMOS_TSC_SINGLE_THREADED   set to 1 to pass --singleThreaded
 *   ATMOS_TSC_FILTER            optional substring filter on workspace name
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const isCi = process.env.CI === "true" || process.env.CI === "1";

const checkers = Number(
  process.env.ATMOS_TSC_CHECKERS ?? (isCi ? "2" : "8"),
);
const builders = Number(
  process.env.ATMOS_TSC_BUILDERS ?? (isCi ? "2" : "4"),
);
const singleThreaded =
  process.env.ATMOS_TSC_SINGLE_THREADED === "1" ||
  process.env.ATMOS_TSC_SINGLE_THREADED === "true";
const filter = process.env.ATMOS_TSC_FILTER?.trim() ?? "";

type Workspace = {
  name: string;
  cwd: string;
  /** Extra args after `tsc` (usually `--noEmit` or `-p …`) */
  args: string[];
  /** If set, run this package script instead of invoking tsc directly */
  script?: string;
};

const workspaces: Workspace[] = [
  { name: "web", cwd: "apps/web", args: ["--noEmit"] },
  { name: "landing", cwd: "apps/landing", args: ["--noEmit"] },
  {
    name: "docs",
    cwd: "apps/docs",
    args: ["--noEmit"],
    script: "typecheck",
  },
  { name: "mobile", cwd: "apps/mobile", args: ["--noEmit"] },
  {
    name: "desktop-electron",
    cwd: "apps/desktop-electron",
    args: ["-p", "tsconfig.json", "--noEmit"],
    script: "typecheck",
  },
  { name: "e2e", cwd: "e2e", args: ["--noEmit"] },
  { name: "ui", cwd: "packages/ui", args: ["--noEmit"] },
  { name: "shared", cwd: "packages/shared", args: ["--noEmit"] },
  { name: "i18n", cwd: "packages/i18n", args: ["--noEmit"] },
  { name: "api-types", cwd: "packages/api-types", args: ["--noEmit"], script: "typecheck" },
  { name: "api-client", cwd: "packages/api-client", args: ["--noEmit"], script: "typecheck" },
  { name: "hub-client", cwd: "packages/hub-client", args: ["--noEmit"], script: "typecheck" },
  { name: "relay-client", cwd: "packages/relay-client", args: ["--noEmit"], script: "typecheck" },
  { name: "pt-design", cwd: "packages/pt-design", args: ["--noEmit"], script: "typecheck" },
  { name: "md-live", cwd: "packages/md-live", args: ["--noEmit"], script: "typecheck" },
  { name: "hub", cwd: "packages/hub", args: ["-p", "tsconfig.json"], script: "typecheck" },
  { name: "relay", cwd: "packages/relay", args: ["-p", "tsconfig.json"] },
];

function resolveTscBin(): string {
  const candidates = [
    join(root, "node_modules", "@typescript", "native", "bin", "tsc"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "TypeScript 7 native binary not found. Install @typescript/native (npm:typescript@7).",
  );
}

function buildArgs(extra: string[]): string[] {
  const args = [...extra];
  const isBuild = extra.includes("-b") || extra.includes("--build");
  if (singleThreaded) {
    args.push("--singleThreaded");
  } else {
    if (Number.isFinite(checkers) && checkers > 0) {
      args.push("--checkers", String(checkers));
    }
    if (isBuild && Number.isFinite(builders) && builders > 0) {
      args.push("--builders", String(builders));
    }
  }
  return args;
}

function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; ms: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, ms: performance.now() - started });
    });
  });
}

async function main() {
  const bin = resolveTscBin();
  const versionProc = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
  let versionOut = "";
  versionProc.stdout?.on("data", (chunk) => {
    versionOut += String(chunk);
  });
  await new Promise<void>((resolve) => versionProc.on("exit", () => resolve()));

  console.log(`[typecheck-all] binary: ${bin}`);
  console.log(`[typecheck-all] ${versionOut.trim() || "version unknown"}`);
  console.log(
    `[typecheck-all] checkers=${singleThreaded ? "singleThreaded" : checkers} builders=${singleThreaded ? "n/a" : builders}`,
  );

  if (!versionOut.includes("7.")) {
    console.error(
      `[typecheck-all] ERROR: expected TypeScript 7.x, got: ${versionOut.trim()}`,
    );
    process.exit(1);
  }

  const selected = workspaces.filter((ws) => {
    if (!filter) return true;
    return ws.name.includes(filter) || ws.cwd.includes(filter);
  });

  let failed = 0;
  const results: { name: string; code: number; ms: number }[] = [];

  for (const ws of selected) {
    const cwd = join(root, ws.cwd);
    if (!existsSync(join(cwd, "tsconfig.json"))) {
      console.warn(`[typecheck-all] skip ${ws.name}: no tsconfig.json`);
      continue;
    }

    let result: { code: number; ms: number };
    if (ws.script) {
      console.log(`\n[typecheck-all] ▶ ${ws.name} (${ws.cwd}) via bun run ${ws.script}`);
      result = await run("bun", ["run", ws.script], cwd);
    } else {
      const args = buildArgs(ws.args);
      console.log(`\n[typecheck-all] ▶ ${ws.name} (${ws.cwd})`);
      console.log(`[typecheck-all]   $ tsc ${args.join(" ")}`);
      result = await run(bin, args, cwd);
    }
    results.push({ name: ws.name, code: result.code, ms: result.ms });
    if (result.code !== 0) failed += 1;
    console.log(
      `[typecheck-all] ${result.code === 0 ? "✓" : "✗"} ${ws.name} in ${(result.ms / 1000).toFixed(2)}s`,
    );
  }

  console.log("\n[typecheck-all] summary");
  for (const row of results) {
    console.log(
      `  ${row.code === 0 ? "✓" : "✗"} ${row.name.padEnd(10)} ${(row.ms / 1000).toFixed(2)}s`,
    );
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
