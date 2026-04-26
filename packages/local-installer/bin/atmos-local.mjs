#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.env.ATMOS_GITHUB_REPO || "AruNi-01/atmos";

function usage() {
  console.log(`Usage: npx @atmos/local [options]

Options:
  --version <tag>        Install a specific release tag instead of latest
  --archive <path>       Install from a prebuilt local runtime archive
  --install-dir <path>   Override install root (default: ~/.atmos)
  --port <port>          Port used when auto-starting the local runtime
  --no-start             Install only, do not launch the local runtime
  --no-open              Install/start but do not open the browser
  -h, --help             Show this help`);
}

function detectTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function parseArgs(argv) {
  const options = {
    version: process.env.ATMOS_VERSION || "latest",
    installDir: resolve(process.env.HOME || process.env.USERPROFILE || ".", ".atmos"),
    port: process.env.ATMOS_PORT || "30303",
    archive: "",
    noStart: false,
    noOpen: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "-h") || (arg === "--help")) {
      usage();
      process.exit(0);
    }
    if (arg === "--version" && argv[i + 1]) {
      options.version = argv[++i];
      continue;
    }
    if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length);
      continue;
    }
    if (arg === "--archive" && argv[i + 1]) {
      options.archive = resolve(argv[++i]);
      continue;
    }
    if (arg.startsWith("--archive=")) {
      options.archive = resolve(arg.slice("--archive=".length));
      continue;
    }
    if (arg === "--install-dir" && argv[i + 1]) {
      options.installDir = resolve(argv[++i]);
      continue;
    }
    if (arg.startsWith("--install-dir=")) {
      options.installDir = resolve(arg.slice("--install-dir=".length));
      continue;
    }
    if (arg === "--port" && argv[i + 1]) {
      options.port = argv[++i];
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = arg.slice("--port=".length);
      continue;
    }
    if (arg === "--no-start") {
      options.noStart = true;
      continue;
    }
    if (arg === "--no-open") {
      options.noOpen = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function spawnChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result;
}

function downloadUrl(version, asset) {
  return `https://github.com/${REPO}/releases/download/${version}/${asset}`;
}

async function resolveReleaseTag(version) {
  if (version !== "latest") {
    return version;
  }

  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve local runtime release tag: ${response.status} ${response.statusText}`);
  }
  const releases = await response.json();
  const match = Array.isArray(releases)
    ? releases.find((release) => {
        const tag = String(release?.tag_name || "");
        return tag.startsWith("local-v") && !release?.draft && !release?.prerelease;
      })
    : null;

  if (!match?.tag_name) {
    throw new Error("No published local-v release was found.");
  }
  return String(match.tag_name);
}

async function ensurePathHint(binDir) {
  const defaultBin = join(process.env.HOME || process.env.USERPROFILE || ".", ".atmos", "bin");
  if (binDir !== defaultBin) {
    console.log(`PATH not modified automatically for custom install dir: ${binDir}`);
    return;
  }

  const currentPath = process.env.PATH || "";
  if (currentPath.split(":").includes(binDir)) {
    return;
  }

  const candidates = [
    process.env.ZDOTDIR ? join(process.env.ZDOTDIR, ".zshrc") : null,
    join(process.env.HOME || "", ".zshrc"),
    join(process.env.HOME || "", ".bashrc"),
    join(process.env.HOME || "", ".bash_profile"),
    join(process.env.HOME || "", ".profile"),
  ].filter(Boolean);

  const profile = candidates.find((path) => existsSync(path)) || candidates[candidates.length - 1];
  const snippet = 'export PATH="$HOME/.atmos/bin:$PATH"';

  let content = "";
  try {
    content = await readFile(profile, "utf8");
  } catch {}
  if (!content.includes(snippet)) {
    await writeFile(profile, `${content.trimEnd()}\n\n# Atmos local runtime\n${snippet}\n`, "utf8");
    console.log(`Updated PATH in ${profile}`);
  }
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    spawnSync("open", [url], { stdio: "ignore" });
    return;
  }
  if (process.platform === "linux") {
    spawnSync("xdg-open", [url], { stdio: "ignore" });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = detectTarget();
  const resolvedVersion = await resolveReleaseTag(options.version);
  const asset = `atmos-local-runtime-${target}.tar.gz`;
  const tempRoot = await mkdtemp(join(tmpdir(), "atmos-local-"));
  const archivePath = join(tempRoot, asset);

  try {
    if (options.archive) {
      cpSync(options.archive, archivePath);
    } else {
      const url = downloadUrl(resolvedVersion, asset);
      console.log(`Downloading ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(archivePath, buffer);
    }

    spawnChecked("tar", ["-xzf", archivePath, "-C", tempRoot]);

    const stagedRuntime = [
      join(tempRoot, "atmos-runtime"),
      join(tempRoot, `atmos-local-runtime-${target}`, "atmos-runtime"),
    ].find((candidate) => existsSync(candidate));
    if (!stagedRuntime) {
      throw new Error("Unable to locate extracted atmos-runtime directory");
    }

    const runtimeRoot = join(options.installDir, "runtime");
    const currentRuntime = join(runtimeRoot, "current");
    const tempRuntime = join(runtimeRoot, "current.tmp");
    mkdirSync(runtimeRoot, { recursive: true });
    rmSync(tempRuntime, { recursive: true, force: true });
    cpSync(stagedRuntime, tempRuntime, { recursive: true });
    rmSync(currentRuntime, { recursive: true, force: true });
    cpSync(tempRuntime, currentRuntime, { recursive: true });
    rmSync(tempRuntime, { recursive: true, force: true });

    const binDir = join(options.installDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const cliTarget = join(currentRuntime, "bin", process.platform === "win32" ? "atmos.exe" : "atmos");
    const cliInstall = join(binDir, process.platform === "win32" ? "atmos.exe" : "atmos");
    cpSync(cliTarget, cliInstall);
    await ensurePathHint(binDir);

    console.log(`Installed Atmos local runtime to ${currentRuntime}`);

    let actualUrl = `http://127.0.0.1:${options.port}`;
    if (!options.noStart) {
      const startResult = spawnChecked(cliInstall, [
        "local",
        "start",
        "--force-restart",
        "--port",
        String(options.port),
      ]);
      try {
        const payload = JSON.parse(startResult.stdout || "{}");
        actualUrl = payload?.status?.url || actualUrl;
      } catch {}
      if (!options.noOpen) {
        openBrowser(actualUrl);
      }
    }

    console.log(`Atmos CLI: ${cliInstall}`);
    console.log(`Installed release: ${resolvedVersion}`);
    console.log(`Local app URL: ${actualUrl}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
