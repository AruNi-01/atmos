import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");
const docsDir = join(rootDir, "apps/docs");
const wranglerConfigPath = join(docsDir, "wrangler.jsonc");
const outputDir = join(docsDir, "out");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd,
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const options = {
    branch:
      process.env.CF_PAGES_BRANCH ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      undefined,
    commitHash: process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || undefined,
    commitMessage:
      process.env.CF_PAGES_COMMIT_MESSAGE || process.env.GITHUB_EVENT_HEAD_COMMIT_MESSAGE || undefined,
    commitDirty: process.env.CF_PAGES_COMMIT_DIRTY || undefined,
    skipCaching: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--branch" && argv[i + 1]) {
      options.branch = argv[++i];
      continue;
    }
    if (arg.startsWith("--branch=")) {
      options.branch = arg.slice("--branch=".length);
      continue;
    }
    if (arg === "--commit-hash" && argv[i + 1]) {
      options.commitHash = argv[++i];
      continue;
    }
    if (arg.startsWith("--commit-hash=")) {
      options.commitHash = arg.slice("--commit-hash=".length);
      continue;
    }
    if (arg === "--commit-message" && argv[i + 1]) {
      options.commitMessage = argv[++i];
      continue;
    }
    if (arg.startsWith("--commit-message=")) {
      options.commitMessage = arg.slice("--commit-message=".length);
      continue;
    }
    if (arg === "--commit-dirty") {
      options.commitDirty = "true";
      continue;
    }
    if (arg === "--skip-caching") {
      options.skipCaching = true;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  return options;
}

if (!existsSync(wranglerConfigPath)) {
  fail(`Missing Wrangler config: ${wranglerConfigPath}`);
}

if (!existsSync(outputDir)) {
  fail(`Missing docs export: ${outputDir}\nRun \`bun run build:docs:pages\` first.`);
}

const options = parseArgs(process.argv.slice(2));
const args = ["wrangler", "pages", "deploy", outputDir];

if (options.branch) {
  args.push("--branch", options.branch);
}

if (options.commitHash) {
  args.push("--commit-hash", options.commitHash);
}

if (options.commitMessage) {
  args.push("--commit-message", options.commitMessage);
}

if (options.commitDirty) {
  args.push("--commit-dirty", options.commitDirty);
}

if (options.skipCaching) {
  args.push("--skip-caching");
}

run("bunx", args, docsDir);
