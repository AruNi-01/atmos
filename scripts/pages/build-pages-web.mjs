import { existsSync, readFileSync, rmSync, writeFileSync, copyFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");
const webDir = join(rootDir, "apps/web");
const webOutDir = join(webDir, "out");
const webEnvLocalPath = join(webDir, ".env.local");
const webPackageJsonPath = join(webDir, "package.json");
const proxyFile = join(webDir, "src/proxy.ts");
const proxyBackupFile = join(webDir, "src/_proxy_pages_backup.ts");

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

function resolveWebVersion() {
  if (process.env.NEXT_PUBLIC_APP_VERSION?.trim()) {
    return process.env.NEXT_PUBLIC_APP_VERSION.trim();
  }

  const packageJson = JSON.parse(readFileSync(webPackageJsonPath, "utf8"));
  const baseVersion = String(packageJson.version || "0.1.0");
  const sha = process.env.CF_PAGES_COMMIT_SHA?.trim();
  return sha ? `${baseVersion}+${sha.slice(0, 7)}` : baseVersion;
}

function ensureRootIndex() {
  const rootIndex = join(webOutDir, "index.html");
  const localeIndex = join(webOutDir, "en", "index.html");
  if (!existsSync(rootIndex) && existsSync(localeIndex)) {
    copyFileSync(localeIndex, rootIndex);
  }
}

function ensurePagesHeaders() {
  const headersPath = join(webOutDir, "_headers");
  if (existsSync(headersPath)) {
    return;
  }

  writeFileSync(
    headersPath,
    `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`,
    "utf8",
  );
}

try {
  rmSync(webOutDir, { recursive: true, force: true });
  if (existsSync(proxyFile)) {
    renameSync(proxyFile, proxyBackupFile);
  }

  run("bun", ["--filter", "web", "build"], {
    env: {
      ...process.env,
      BUILD_TARGET: "pages",
      NEXT_PUBLIC_BUILD_TARGET: "pages",
      NEXT_PUBLIC_APP_VERSION: resolveWebVersion(),
      NEXT_PUBLIC_TLDRAW_LICENSE_KEY:
        process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY ??
        loadWebEnvVar("NEXT_PUBLIC_TLDRAW_LICENSE_KEY"),
      ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
    },
  });

  ensureRootIndex();
  ensurePagesHeaders();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(error?.exitCode ?? 1);
} finally {
  if (existsSync(proxyBackupFile)) {
    renameSync(proxyBackupFile, proxyFile);
  }
}
