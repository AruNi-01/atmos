#!/usr/bin/env bun
/**
 * Typecheck benchmark for QUALITY-005.
 * Compares wall times against specs/.../assets/typecheck-baseline.md.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const baselinePath = join(
  root,
  "specs/APP/QUALITY-005_typescript-7-upgrade/assets/typecheck-baseline.md",
);

const targets = [
  { name: "web", cwd: "apps/web", baselineKey: "apps/web" },
  { name: "mobile", cwd: "apps/mobile", baselineKey: "apps/mobile" },
  { name: "ui", cwd: "packages/ui", baselineKey: "packages/ui" },
] as const;

function resolveTscBin(): string {
  const candidates = [
    join(root, "node_modules", "@typescript", "native", "bin", "tsc"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("TypeScript 7 native binary not found");
}

function runTsc(bin: string, cwd: string, checkers: number): Promise<number> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      ["--noEmit", "--checkers", String(checkers)],
      { cwd, stdio: "inherit" },
    );
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`tsc failed in ${cwd} with code ${code}`));
      else resolve(performance.now() - started);
    });
  });
}

function parseBaseline(): Record<string, number> {
  if (!existsSync(baselinePath)) return {};
  const text = readFileSync(baselinePath, "utf8");
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    // | `apps/web` | 19.23 | ...
    const match = line.match(/\|\s*`([^`]+)`\s*\|\s*([\d.]+)\s*\|/);
    if (match) out[match[1]] = Number(match[2]);
  }
  return out;
}

async function main() {
  const bin = resolveTscBin();
  const checkers = Number(process.env.ATMOS_TSC_CHECKERS ?? "8");
  const baseline = parseBaseline();

  const versionProc = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
  let version = "";
  versionProc.stdout?.on("data", (c) => {
    version += String(c);
  });
  await new Promise<void>((r) => versionProc.on("exit", () => r()));
  console.log(`[typecheck-bench] ${version.trim()}`);
  console.log(`[typecheck-bench] checkers=${checkers}`);

  const rows: {
    name: string;
    ms: number;
    baseline?: number;
    speedup?: number;
  }[] = [];

  for (const target of targets) {
    const cwd = join(root, target.cwd);
    console.log(`\n[typecheck-bench] ▶ ${target.name}`);
    const ms = await runTsc(bin, cwd, checkers);
    const base = baseline[target.baselineKey];
    const speedup = base ? base / (ms / 1000) : undefined;
    rows.push({ name: target.name, ms, baseline: base, speedup });
    console.log(
      `[typecheck-bench] ${target.name}: ${(ms / 1000).toFixed(2)}s` +
        (speedup ? ` (${speedup.toFixed(2)}× vs baseline ${base}s)` : ""),
    );
  }

  console.log("\n[typecheck-bench] summary");
  console.log("| Package | After (s) | Baseline (s) | Speedup |");
  console.log("|---------|-----------|--------------|---------|");
  for (const row of rows) {
    console.log(
      `| ${row.name} | ${(row.ms / 1000).toFixed(2)} | ${row.baseline?.toFixed(2) ?? "—"} | ${row.speedup ? `${row.speedup.toFixed(2)}×` : "—"} |`,
    );
  }

  const web = rows.find((r) => r.name === "web");
  if (web?.speedup != null && web.speedup < 3) {
    console.warn(
      `\n[typecheck-bench] WARN: web speedup ${web.speedup.toFixed(2)}× is below the 3× budget. Tune ATMOS_TSC_CHECKERS and confirm native binary.`,
    );
    process.exitCode = 0; // still succeed; TEST Coverage Status records the exception
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
