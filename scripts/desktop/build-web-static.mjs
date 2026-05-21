/**
 * Build apps/web static export for Desktop (BUILD_TARGET=desktop) and copy to sidecar web-out.
 * Used by prepare-sidecar.sh (dev) and before-build.mjs (release).
 */

import { cpSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultRootDir = resolve(import.meta.dirname, "../..");

function loadWebEnvVar(rootDir, name) {
  if (process.env[name]) return process.env[name];
  const webEnvLocalPath = join(rootDir, "apps/web/.env.local");
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

function run(rootDir, command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Run `next build` with desktop static export settings. */
export function buildWebStaticForDesktop(rootDir = defaultRootDir) {
  const webApiDir = join(rootDir, "apps/web/src/app/api");
  const webApiBackup = join(rootDir, "apps/web/src/app/_api_desktop_backup");
  const webDevLock = join(rootDir, "apps/web/.next/dev/lock");
  const hasApiDir = existsSync(webApiDir);

  if (hasApiDir) {
    renameSync(webApiDir, webApiBackup);
  }
  if (existsSync(webDevLock)) {
    rmSync(webDevLock, { force: true });
  }

  try {
    console.log("🔨 Building web static export (BUILD_TARGET=desktop)...");
    run(rootDir, "bun", ["--filter", "web", "build"], {
      BUILD_TARGET: "desktop",
      NEXT_PUBLIC_TLDRAW_LICENSE_KEY:
        process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY ??
        loadWebEnvVar(rootDir, "NEXT_PUBLIC_TLDRAW_LICENSE_KEY") ??
        "",
      ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
    });
  } finally {
    if (hasApiDir) {
      renameSync(webApiBackup, webApiDir);
    }
  }

  const webOut = join(rootDir, "apps/web/out");
  if (!existsSync(webOut)) {
    console.error(`error: web static export missing at ${webOut}`);
    process.exit(1);
  }

  return webOut;
}

/** Copy apps/web/out → binaries/web-out (with root index.html fix). */
export function copyWebStaticToSidecar(rootDir = defaultRootDir, webOut = join(rootDir, "apps/web/out")) {
  const sidecarWebOut = join(rootDir, "apps/desktop/src-tauri/binaries/web-out");
  const indexHtmlPath = join(webOut, "index.html");
  const enIndexPath = join(webOut, "en", "index.html");

  if (!existsSync(indexHtmlPath) && existsSync(enIndexPath)) {
    cpSync(enIndexPath, indexHtmlPath);
  }

  rmSync(sidecarWebOut, { recursive: true, force: true });
  cpSync(webOut, sidecarWebOut, { recursive: true });
  console.log(`📦 Copied web static export to: ${sidecarWebOut}`);
  return sidecarWebOut;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const rootDir = process.argv[2] ? resolve(process.argv[2]) : defaultRootDir;
  if (process.env.ATMOS_DESKTOP_SKIP_WEB_BUILD === "1") {
    const webOut = join(rootDir, "apps/web/out");
    if (!existsSync(webOut)) {
      console.error(
        "error: ATMOS_DESKTOP_SKIP_WEB_BUILD=1 but apps/web/out is missing — run without skip or build web first",
      );
      process.exit(1);
    }
    console.log("⏭️  Skipping web build (ATMOS_DESKTOP_SKIP_WEB_BUILD=1)");
    copyWebStaticToSidecar(rootDir, webOut);
  } else {
    const webOut = buildWebStaticForDesktop(rootDir);
    copyWebStaticToSidecar(rootDir, webOut);
  }
}
