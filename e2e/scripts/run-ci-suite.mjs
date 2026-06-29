#!/usr/bin/env bun

import { spawn } from "node:child_process";

const suite = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const statefulWorkerArgs = ["--workers=1"];

const suiteMap = {
  "all-smoke": ["test", "--project=chromium", "tests/smoke", ...statefulWorkerArgs],
  "smoke-stateless": [
    "test",
    "--project=chromium",
    "--grep",
    "@smoke",
    "--grep-invert",
    "@stateful",
  ],
  "smoke-stateful": [
    "test",
    "--project=chromium",
    "--grep",
    "@stateful",
    ...statefulWorkerArgs,
  ],
  "smoke-routes": ["test", "--project=chromium", "tests/smoke/routes"],
  "smoke-onboarding": ["test", "--project=chromium", "tests/smoke/onboarding"],
  "smoke-app-shell": ["test", "--project=chromium", "tests/smoke/app-shell", ...statefulWorkerArgs],
  "smoke-project": ["test", "--project=chromium", "tests/smoke/project", ...statefulWorkerArgs],
  "smoke-settings": ["test", "--project=chromium", "tests/smoke/settings", ...statefulWorkerArgs],
  "smoke-workspace": ["test", "--project=chromium", "tests/smoke/workspace", ...statefulWorkerArgs],
  specs: ["test", "tests/specs"],
  full: ["test"],
};

if (!suite || !suiteMap[suite]) {
  const knownSuites = Object.keys(suiteMap).join(", ");
  console.error(`Unknown or missing CI suite "${suite ?? ""}". Known suites: ${knownSuites}`);
  process.exit(1);
}

const args = [
  "playwright",
  ...suiteMap[suite],
  "--reporter=blob,line",
  "--output",
  `test-results/${suite}`,
];

const env = {
  ...process.env,
  CI: process.env.CI ?? "1",
  PLAYWRIGHT_BLOB_OUTPUT_DIR:
    process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR ?? `reports/blob/${suite}`,
};
if (env.CI && !env.CARGO_BUILD_JOBS) {
  env.CARGO_BUILD_JOBS = "1";
}

if (dryRun) {
  console.log(`PLAYWRIGHT_BLOB_OUTPUT_DIR=${env.PLAYWRIGHT_BLOB_OUTPUT_DIR}`);
  if (env.CARGO_BUILD_JOBS) {
    console.log(`CARGO_BUILD_JOBS=${env.CARGO_BUILD_JOBS}`);
  }
  console.log(`bunx ${args.join(" ")}`);
  process.exit(0);
}

const command = process.platform === "win32" ? "bunx.cmd" : "bunx";
const child = spawn(command, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
