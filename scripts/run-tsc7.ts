#!/usr/bin/env bun
/**
 * Run native TypeScript 7 `tsc` from the monorepo root, regardless of which
 * workspace package script invoked us (local typescript@6 must not win PATH).
 *
 * Forwards all CLI args. Adds --checkers / --builders from env unless
 * ATMOS_TSC_SINGLE_THREADED=1 or the caller already passed those flags.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function findRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (
      existsSync(join(dir, "package.json")) &&
      existsSync(join(dir, "apps")) &&
      existsSync(join(dir, "packages"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate monorepo root from " + start);
    }
    dir = parent;
  }
}

const root = findRoot(process.cwd());
const bin = join(root, "node_modules", "@typescript", "native", "bin", "tsc");
if (!existsSync(bin)) {
  console.error(
    "TypeScript 7 native binary missing. Run bun install (need @typescript/native).",
  );
  process.exit(1);
}

const isCi = process.env.CI === "true" || process.env.CI === "1";
const singleThreaded =
  process.env.ATMOS_TSC_SINGLE_THREADED === "1" ||
  process.env.ATMOS_TSC_SINGLE_THREADED === "true";
const userArgs = process.argv.slice(2);
const hasCheckers = userArgs.some((a) => a === "--checkers" || a.startsWith("--checkers="));
const hasBuilders = userArgs.some((a) => a === "--builders" || a.startsWith("--builders="));
const hasSingle = userArgs.includes("--singleThreaded");

const args = [...userArgs];
const isBuild = userArgs.includes("-b") || userArgs.includes("--build");
if (singleThreaded || hasSingle) {
  if (!hasSingle) args.push("--singleThreaded");
} else {
  if (!hasCheckers) {
    args.push(
      "--checkers",
      process.env.ATMOS_TSC_CHECKERS ?? (isCi ? "2" : "8"),
    );
  }
  if (isBuild && !hasBuilders) {
    args.push(
      "--builders",
      process.env.ATMOS_TSC_BUILDERS ?? (isCi ? "2" : "4"),
    );
  }
}

const child = spawn(bin, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
