import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");
const localRuntimeVersionJson = join(rootDir, "resources/local-runtime/version.json");
const webEnvLocalPath = join(rootDir, "apps/web/.env.local");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    const error = new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`,
    );
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function loadWebEnvVar(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(webEnvLocalPath)) return undefined;

  const content = readFileSync(webEnvLocalPath, "utf8");
  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("#") && entry.startsWith(`${name}=`));

  if (!line) return undefined;

  const rawValue = line.slice(name.length + 1).trim();
  const quotedWithDouble = rawValue.startsWith('"') && rawValue.endsWith('"');
  const quotedWithSingle = rawValue.startsWith("'") && rawValue.endsWith("'");
  return quotedWithDouble || quotedWithSingle ? rawValue.slice(1, -1) : rawValue;
}

function parseArgs(argv) {
  const options = {
    targetTriple: process.env.TARGET_TRIPLE || "",
    version: process.env.ATMOS_RUNTIME_VERSION || "",
    outputDir: join(rootDir, "dist", "local-runtime"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target" && argv[i + 1]) {
      options.targetTriple = argv[++i];
      continue;
    }
    if (arg.startsWith("--target=")) {
      options.targetTriple = arg.slice("--target=".length);
      continue;
    }
    if (arg === "--version" && argv[i + 1]) {
      options.version = argv[++i];
      continue;
    }
    if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length);
      continue;
    }
    if (arg === "--output-dir" && argv[i + 1]) {
      options.outputDir = resolve(rootDir, argv[++i]);
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = resolve(rootDir, arg.slice("--output-dir=".length));
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  return options;
}

function detectTargetTriple(input) {
  if (input) return input;
  const rustc = spawnSync("rustc", ["-vV"], {
    cwd: rootDir,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  if (rustc.status !== 0) {
    process.exit(rustc.status ?? 1);
  }

  const hostLine = rustc.stdout.split("\n").find((line) => line.startsWith("host:"));
  if (!hostLine) {
    fail("Unable to detect rust host triple from `rustc -vV`.");
  }
  return hostLine.replace("host:", "").trim();
}

function readLocalRuntimeVersion() {
  const versionJson = JSON.parse(readFileSync(localRuntimeVersionJson, "utf8"));
  const version = versionJson?.version;
  if (!version) {
    fail(`Unable to resolve local runtime version from ${localRuntimeVersionJson}`);
  }
  return String(version);
}

function resolveRuntimeVersion(input) {
  if (input) return input;

  const baseVersion = readLocalRuntimeVersion();
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  const sha = git.status === 0 ? git.stdout.trim() : "dev";
  return `${baseVersion}+${sha}`;
}

function buildStaticWebExport(runtimeVersion) {
  const webApiDir = join(rootDir, "apps/web/src/app/api");
  const backupDir = join(rootDir, "apps/web/src/app/_api_local_runtime_backup");
  const devLock = join(rootDir, "apps/web/.next/dev/lock");
  const hasApiDir = existsSync(webApiDir);

  if (hasApiDir) {
    renameSync(webApiDir, backupDir);
  }
  if (existsSync(devLock)) {
    rmSync(devLock, { force: true });
  }

  try {
    run("bun", ["--filter", "web", "build"], {
      env: {
        ...process.env,
        BUILD_TARGET: "local-web",
        NEXT_PUBLIC_BUILD_TARGET: "local-web",
        NEXT_PUBLIC_APP_VERSION: runtimeVersion,
        NEXT_PUBLIC_TLDRAW_LICENSE_KEY: process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY ?? loadWebEnvVar("NEXT_PUBLIC_TLDRAW_LICENSE_KEY"),
        ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
      },
    });
  } finally {
    if (hasApiDir) {
      renameSync(backupDir, webApiDir);
    }
  }
}

function ensureRootIndex(webOut) {
  const rootIndex = join(webOut, "index.html");
  const localeIndex = join(webOut, "en", "index.html");
  if (!existsSync(rootIndex) && existsSync(localeIndex)) {
    cpSync(localeIndex, rootIndex);
  }
}

function createArchive(runtimeDir, outputArchive) {
  mkdirSync(dirname(outputArchive), { recursive: true });
  rmSync(outputArchive, { force: true });
  const parentDir = resolve(runtimeDir, "..");
  const folderName = runtimeDir.split(/[\\/]/).pop();
  run("tar", ["-czf", outputArchive, "-C", parentDir, folderName]);
}

const options = parseArgs(process.argv.slice(2));
const targetTriple = detectTargetTriple(options.targetTriple);
const runtimeVersion = resolveRuntimeVersion(options.version);
const binExt = targetTriple.includes("windows") ? ".exe" : "";

try {
  buildStaticWebExport(runtimeVersion);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(error?.exitCode ?? 1);
}

run("cargo", ["build", "--release", "--bin", "api", "--target", targetTriple], {
  env: {
    ...process.env,
    ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
  },
});

const stageRoot = join(options.outputDir, `atmos-local-runtime-${targetTriple}`);
const runtimeDir = join(stageRoot, "atmos-runtime");
const apiSource = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
const webOut = join(rootDir, "apps/web/out");
const skillsDir = join(rootDir, "skills");

if (!existsSync(apiSource)) fail(`Missing built Atmos Server binary: ${apiSource}`);
if (!existsSync(webOut)) fail(`Missing static web export: ${webOut}`);

ensureRootIndex(webOut);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(join(runtimeDir, "bin"), { recursive: true });
mkdirSync(join(runtimeDir, "web"), { recursive: true });

cpSync(apiSource, join(runtimeDir, "bin", `Atmos Server${binExt}`));
cpSync(webOut, join(runtimeDir, "web"), { recursive: true });

if (existsSync(skillsDir)) {
  cpSync(skillsDir, join(runtimeDir, "system-skills"), { recursive: true });
}

writeFileSync(join(runtimeDir, "version.txt"), `${runtimeVersion}\n`, "utf8");
writeFileSync(
  join(runtimeDir, "manifest.json"),
  JSON.stringify(
    {
      schema_version: 1,
      product: "atmos-local-runtime",
      runtime_version: runtimeVersion,
      target_triple: targetTriple,
      built_at: new Date().toISOString(),
      layout: {
        api: `bin/Atmos Server${binExt}`,
        web: "web",
        system_skills: "system-skills",
      },
    },
    null,
    2,
  ),
  "utf8",
);

const archivePath = join(options.outputDir, `atmos-local-runtime-${targetTriple}.tar.gz`);
createArchive(runtimeDir, archivePath);

console.log(`Prepared local runtime directory: ${runtimeDir}`);
console.log(`Prepared local runtime archive: ${archivePath}`);
