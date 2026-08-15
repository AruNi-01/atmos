import { cpSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");
const landingDir = join(rootDir, "apps/landing");
const landingOutDir = join(landingDir, "out");
const proxyFile = join(landingDir, "src/proxy.ts");
const proxyBackupFile = join(landingDir, "src/_proxy_pages_backup.ts");
const downloadLinksRouteDir = join(landingDir, "src/app/api/download-links");
const downloadLinksRouteBackupDir = join(
  landingDir,
  "src/app/api/_download_links_pages_backup",
);
const videosDir = join(landingDir, "public/videos");
const videosBackupDir = join(landingDir, ".videos_pages_backup");

const DEFAULT_ASSETS_BASE_URL = "https://assets.atmos.land";

function moveAside(source, destination) {
  if (!existsSync(source)) {
    return;
  }
  rmSync(destination, { recursive: true, force: true });
  try {
    renameSync(source, destination);
  } catch {
    cpSync(source, destination, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function restoreAside(source, destination) {
  if (!existsSync(source)) {
    return;
  }
  rmSync(destination, { recursive: true, force: true });
  try {
    renameSync(source, destination);
  } catch {
    cpSync(source, destination, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  }
}

let sourcesRestored = false;

function restoreMovedSources() {
  if (sourcesRestored) {
    return;
  }
  sourcesRestored = true;
  restoreAside(downloadLinksRouteBackupDir, downloadLinksRouteDir);
  restoreAside(proxyBackupFile, proxyFile);
  restoreAside(videosBackupDir, videosDir);
}

function registerTerminationHandlers() {
  const exitCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  const signals = ["SIGINT", "SIGTERM"];
  if (process.platform !== "win32") {
    signals.push("SIGHUP");
  }

  for (const signal of signals) {
    process.once(signal, () => {
      restoreMovedSources();
      process.exit(exitCodes[signal] ?? 1);
    });
  }
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

function ensureRootIndex() {
  const rootIndex = join(landingOutDir, "index.html");
  if (existsSync(rootIndex)) {
    return;
  }

  const localeIndex = join(landingOutDir, "en.html");
  if (existsSync(localeIndex)) {
    cpSync(localeIndex, rootIndex);
  }
}

function ensurePagesHeaders() {
  writeFileSync(
    join(landingOutDir, "_headers"),
    `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`,
    "utf8",
  );
}

function copyDefaultLocalePages() {
  const defaultLocaleDir = join(landingOutDir, "en");
  if (!existsSync(defaultLocaleDir)) {
    return;
  }

  for (const entry of readdirSync(defaultLocaleDir)) {
    cpSync(join(defaultLocaleDir, entry), join(landingOutDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

function ensurePagesRedirects() {
  writeFileSync(
    join(landingOutDir, "_redirects"),
    `/en / 302
/en/* /:splat 302
/tok/* https://app.atmos.land/tok/:splat 302
`,
    "utf8",
  );
}

let exitCode = 0;

try {
  rmSync(landingOutDir, { recursive: true, force: true });
  registerTerminationHandlers();
  moveAside(proxyFile, proxyBackupFile);
  moveAside(downloadLinksRouteDir, downloadLinksRouteBackupDir);
  moveAside(videosDir, videosBackupDir);

  run("bun", ["--filter", "landing", "build"], {
    env: {
      ...process.env,
      BUILD_TARGET: "pages",
      NEXT_PUBLIC_BUILD_TARGET: "pages",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://atmos.land",
      NEXT_PUBLIC_ASSETS_BASE_URL:
        process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? DEFAULT_ASSETS_BASE_URL,
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "",
    },
  });

  copyDefaultLocalePages();
  ensureRootIndex();
  ensurePagesHeaders();
  ensurePagesRedirects();
} catch (error) {
  console.error(error.message ?? error);
  exitCode = error?.exitCode ?? 1;
} finally {
  restoreMovedSources();
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
